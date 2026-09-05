import cv2
import numpy as np
import supervision as sa
from ultralytics import YOLO

class SafeSiteEngine:
    def __init__(self, model_path: str = "models/best.pt"):
        self.model = YOLO(model_path)
        self.tracker = sa.ByteTrack()
        
        self.class_names = self.model.names
        print(f"[DEBUG] Loaded Model Classes: {self.class_names}")

        # Explicitly map based on your model's exact dictionary:
        # {0: 'Hardhat', 1: 'Mask', 2: 'NO-Hardhat', 3: 'NO-Mask', 4: 'NO-Safety Vest', 5: 'Person', 6: 'Safety Cone', 7: 'Safety Vest', 8: 'machinery', 9: 'vehicle'}
        self.person_id = 5
        self.hardhat_id = 0
        self.vest_id = 7
        self.no_hardhat_id = 2
        self.no_vest_id = 4

    def process_frame(self, frame: np.ndarray, geofence_polygons: list[dict]):
        h, w = frame.shape[:2]
        
        results = self.model(frame, conf=0.25, verbose=False)[0]
        detections = sa.Detections.from_ultralytics(results)

        # Separate persons from gear/other objects
        is_person = (detections.class_id == self.person_id) if len(detections) > 0 else np.array([], dtype=bool)
        person_detections = detections[is_person] if len(detections) > 0 else sa.Detections.empty()
        ppe_detections = detections[~is_person] if len(detections) > 0 else detections

        # Update tracker
        if len(person_detections) > 0:
            tracked_persons = self.tracker.update_with_detections(person_detections)
        else:
            tracked_persons = sa.Detections.empty()

        # Parse geofences
        pixel_zones = []
        for zone in geofence_polygons:
            pts = np.array([[int(p[0] * w), int(p[1] * h)] for p in zone["points"]], dtype=np.int32)
            pixel_zones.append({"zone_id": zone.get("zone_id", "Hazard Zone"), "poly": pts})

        payload_detections = []
        violations = []

        if len(tracked_persons) > 0:
            for i in range(len(tracked_persons)):
                box = tracked_persons.xyxy[i]
                track_id = int(tracked_persons.tracker_id[i]) if (tracked_persons.tracker_id is not None and len(tracked_persons.tracker_id) > i) else (i + 1)
                
                x1, y1, x2, y2 = map(int, box)
                foot_point = ((x1 + x2) // 2, y2)

                # Check danger zone
                in_danger_zone = False
                active_zone = None
                for zone in pixel_zones:
                    if cv2.pointPolygonTest(zone["poly"], foot_point, False) >= 0:
                        in_danger_zone = True
                        active_zone = zone["zone_id"]
                        break

                # Check PPE compliance via expanded bounding box
                has_hardhat = False
                has_vest = False
                explicit_no_hat = False
                explicit_no_vest = False

                pad_x = int((x2 - x1) * 0.15)
                pad_y = int((y2 - y1) * 0.1)
                exp_x1 = max(0, x1 - pad_x)
                exp_y1 = max(0, y1 - int(pad_y * 2))
                exp_x2 = x2 + pad_x
                exp_y2 = y2 + pad_y

                for j in range(len(ppe_detections)):
                    p_box = ppe_detections.xyxy[j]
                    p_cls = ppe_detections.class_id[j]

                    p_cx = (p_box[0] + p_box[2]) / 2
                    p_cy = (p_box[1] + p_box[3]) / 2

                    if exp_x1 <= p_cx <= exp_x2 and exp_y1 <= p_cy <= exp_y2:
                        if p_cls == self.hardhat_id:
                            has_hardhat = True
                        elif p_cls == self.vest_id:
                            has_vest = True
                        elif p_cls == self.no_hardhat_id:
                            explicit_no_hat = True
                        elif p_cls == self.no_vest_id:
                            explicit_no_vest = True

                reasons = []
                if explicit_no_hat or not has_hardhat:
                    reasons.append("Missing Hardhat")
                if explicit_no_vest or not has_vest:
                    reasons.append("Missing Safety Vest")
                if in_danger_zone:
                    reasons.append(f"In Danger Zone: {active_zone}")

                is_violating = len(reasons) > 0

                if is_violating:
                    violations.append({
                        "track_id": track_id,
                        "reasons": reasons,
                        "zone": active_zone,
                        "coords": [round(foot_point[0] / w, 4), round(foot_point[1] / h, 4)]
                    })

                payload_detections.append({
                    "track_id": track_id,
                    "bbox": [round(x1 / w, 4), round(y1 / h, 4), round(x2 / w, 4), round(y2 / h, 4)],
                    "has_hardhat": has_hardhat and not explicit_no_hat,
                    "has_vest": has_vest and not explicit_no_vest,
                    "in_danger_zone": in_danger_zone,
                    "is_violating": is_violating
                })

        return {
            "detections": payload_detections,
            "violations": violations,
            "worker_count": len(tracked_persons),
            "violation_count": len(violations)
        }
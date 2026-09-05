import streamlit as st
import cv2
import numpy as np
from ultralytics import YOLO
from PIL import Image
import tempfile
import os

st.set_page_config(page_title="SafeSite AI", page_icon="🪖", layout="wide")

@st.cache_resource
def load_model():
    # Check possible paths for best.pt
    paths_to_try = ["backend/models/best.pt", "models/best.pt", "best.pt"]
    for path in paths_to_try:
        if os.path.exists(path):
            return YOLO(path)
    st.error("Model weights file (best.pt) not found! Please check its location in your repository.")
    return None


model = load_model()

st.title("🪖 SafeSite AI: PPE & Geofencing Monitor")
st.sidebar.header("Configuration & Upload")

uploaded_file = st.sidebar.file_uploader("Upload Construction CCTV Video", type=["mp4", "mov", "avi"])

conf_threshold = st.sidebar.slider("Confidence Threshold", 0.1, 0.9, 0.25, 0.05)

if uploaded_file is not None:
    tfile = tempfile.NamedTemporaryFile(delete=False)
    tfile.write(uploaded_file.read())
    
    cap = cv2.VideoCapture(tfile.name)
    stframe = st.empty()
    
    col1, col2 = st.columns(2)
    with col1:
        worker_metric = st.metric("Tracked Workers", 0)
    with col2:
        violation_metric = st.metric("Active Infractions", 0, delta_color="inverse")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        results = model(frame, conf=conf_threshold, verbose=False)[0]
        annotated_frame = results.plot()
        
        # Count stats
        boxes = results.boxes
        cls_list = boxes.cls.cpu().numpy() if boxes is not None else []
        person_count = int(np.sum(cls_list == 5)) # Class 5 is Person
        
        stframe.image(annotated_frame, channels="BGR", use_container_width=True)
        
    cap.release()
    os.unlink(tfile.name)
else:
    st.info("👈 Upload a CCTV video clip using the sidebar to begin real-time PPE tracking.")
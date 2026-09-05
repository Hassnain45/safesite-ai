import React, { useRef, useState, useEffect, useCallback } from 'react';
import { 
  HardHat, 
  Video, 
  Upload, 
  PlusCircle, 
  CheckCircle2, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  ShieldAlert,
  Download
} from 'lucide-react';
import './index.css';

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastAlertTimeRef = useRef(0);
  const lastSentRef = useRef(0);

  const [connected, setConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [feedSource, setFeedSource] = useState('none'); // 'camera' | 'file' | 'none'
  const [audioEnabled, setAudioEnabled] = useState(true);

  const [zones, setZones] = useState([]);
  const [currentPolygon, setCurrentPolygon] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  
  const [telemetry, setTelemetry] = useState({ 
    worker_count: 0, 
    violation_count: 0, 
    detections: [] 
  });
  const [logs, setLogs] = useState([]);

  // Synthesized Web Audio Sound Alarm
  const triggerAudioAlarm = useCallback(() => {
    if (!audioEnabled) return;
    const now = Date.now();
    if (now - lastAlertTimeRef.current < 2500) return;
    lastAlertTimeRef.current = now;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(820, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // Audio context fallback
    }
  }, [audioEnabled]);

  // Stable WebSocket Connection Loop
  useEffect(() => {
    let socket = null;
    let isCancelled = false;

    const connectWebSocket = () => {
      if (isCancelled) return;
      
      socket = new WebSocket('ws://localhost:8000/ws/inference');
      wsRef.current = socket;

      socket.onopen = () => {
        if (!isCancelled) setConnected(true);
      };

      socket.onclose = () => {
        if (!isCancelled) {
          setConnected(false);
          setTimeout(connectWebSocket, 2000);
        }
      };

      socket.onerror = () => {
        socket.close();
      };

      socket.onmessage = (event) => {
        if (isCancelled) return;
        const data = JSON.parse(event.data);
        setTelemetry(data);

        if (data.violations && data.violations.length > 0) {
          triggerAudioAlarm();

          const video = videoRef.current;
          let snapUrl = null;
          if (video && video.readyState >= 2) {
            const snapCanvas = document.createElement('canvas');
            snapCanvas.width = 160;
            snapCanvas.height = 120;
            const sCtx = snapCanvas.getContext('2d');
            sCtx.drawImage(video, 0, 0, 160, 120);
            snapUrl = snapCanvas.toDataURL('image/jpeg', 0.6);
          }

          setLogs((prev) => [
            ...data.violations.map((v) => ({
              id: Math.random().toString(36).substr(2, 9),
              time: new Date().toLocaleTimeString(),
              thumbnail: snapUrl,
              ...v
            })),
            ...prev.slice(0, 25)
          ]);
        }
      };
    };

    connectWebSocket();

    return () => {
      isCancelled = true;
      if (socket) {
        socket.close();
      }
    };
  }, [triggerAudioAlarm]);

  const syncZones = (updatedZones) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'UPDATE_ZONES', zones: updatedZones }));
    }
  };

  // Webcam Stream
  const startCamera = async () => {
    try {
      stopActiveFeed();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsStreaming(true);
        setFeedSource('camera');
      }
    } catch (err) {
      alert('Camera access failed: ' + err.message);
    }
  };

  // Video File Stream
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    stopActiveFeed();
    const fileUrl = URL.createObjectURL(file);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = fileUrl;
      videoRef.current.loop = true;
      videoRef.current.play();
      setIsStreaming(true);
      setFeedSource('file');
    }
  };

  const stopActiveFeed = () => {
    if (videoRef.current) {
      if (videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
    }
    setIsStreaming(false);
    setFeedSource('none');
  };

  // CSV Audit Log Export Function
  const exportCSV = () => {
    if (logs.length === 0) return alert("No incidents recorded yet.");
    const headers = "ID,Timestamp,Worker_ID,Violations,Zone\n";
    const rows = logs.map(l => 
      `"${l.id}","${l.time}","${l.track_id}","${l.reasons.join('; ')}","${l.zone || 'None'}"`
    ).join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `safesite_audit_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  // Real-time Canvas Rendering & Throttled Frame Transmission (~15 FPS)
  const renderFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw saved Danger Zones
    zones.forEach((z) => {
      if (z.points.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(z.points[0][0] * w, z.points[0][1] * h);
      for (let i = 1; i < z.points.length; i++) {
        ctx.lineTo(z.points[i][0] * w, z.points[i][1] * h);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
      ctx.fill();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(z.zone_id, z.points[0][0] * w + 5, z.points[0][1] * h + 15);
    });

    // 2. Draw Active Drawing Path
    if (currentPolygon.length > 0) {
      ctx.beginPath();
      ctx.moveTo(currentPolygon[0][0] * w, currentPolygon[0][1] * h);
      for (let i = 1; i < currentPolygon.length; i++) {
        ctx.lineTo(currentPolygon[i][0] * w, currentPolygon[i][1] * h);
      }
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      currentPolygon.forEach(([x, y]) => {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(x * w, y * h, 4, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    // 3. Draw Tracked Worker Detections
    telemetry.detections.forEach((det) => {
      const [x1, y1, x2, y2] = det.bbox;
      const bx = x1 * w;
      const by = y1 * h;
      const bw = (x2 - x1) * w;
      const bh = (y2 - y1) * h;

      const strokeColor = det.is_violating ? '#ef4444' : '#10b981';
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.fillStyle = det.is_violating ? '#ef4444' : '#10b981';
      ctx.fillRect(bx, by - 22, Math.max(bw, 140), 22);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(
        `#${det.track_id} | ${det.has_hardhat ? '✓ Hat' : '✗ Hat'} | ${det.has_vest ? '✓ Vest' : '✗ Vest'}`,
        bx + 5,
        by - 7
      );
    });

    // 4. Send frame snapshot to FastAPI (~15 FPS throttling)
    const now = Date.now();
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isStreaming && now - lastSentRef.current > 66) {
      lastSentRef.current = now;
      const offscreen = document.createElement('canvas');
      offscreen.width = 640;
      offscreen.height = 480;
      const oCtx = offscreen.getContext('2d');
      oCtx.drawImage(video, 0, 0, 640, 480);

      offscreen.toBlob((blob) => {
        if (blob && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          blob.arrayBuffer().then((buf) => wsRef.current.send(buf));
        }
      }, 'image/jpeg', 0.55);
    }
  }, [zones, currentPolygon, telemetry, isStreaming]);

  useEffect(() => {
    let animId;
    const loop = () => {
      renderFrame();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [renderFrame]);

  // Click handler to draw geofence coordinates
  const onCanvasClick = (e) => {
    if (!isDrawing) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setCurrentPolygon((p) => [...p, [x, y]]);
  };

  const finishZone = () => {
    if (currentPolygon.length >= 3) {
      const updated = [...zones, { zone_id: `Danger Zone ${zones.length + 1}`, points: currentPolygon }];
      setZones(updated);
      syncZones(updated);
    }
    setCurrentPolygon([]);
    setIsDrawing(false);
  };

  const clearAllZones = () => {
    setZones([]);
    setCurrentPolygon([]);
    setIsDrawing(false);
    syncZones([]);
  };

  return (
    <div>
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <HardHat size={28} color="#f59e0b" />
          <div>
            <h2>SafeSite AI</h2>
            <small style={{ color: '#94a3b8' }}>PPE Detection & Hazard Geofencing Engine</small>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <div className="status-badge">
            <span className={`dot ${connected ? 'online' : 'offline'}`}></span>
            {connected ? 'FastAPI Connected' : 'Disconnected'}
          </div>

          <button 
            className="btn btn-gray" 
            onClick={() => setAudioEnabled(!audioEnabled)}
            title={audioEnabled ? 'Mute Alarms' : 'Unmute Alarms'}
          >
            {audioEnabled ? <Volume2 size={16} color="#10b981" /> : <VolumeX size={16} color="#ef4444" />}
          </button>

          {!isStreaming ? (
            <>
              <button className="btn btn-green" onClick={startCamera}>
                <Video size={16} /> Webcam
              </button>

              <button className="btn btn-purple" onClick={() => fileInputRef.current.click()}>
                <Upload size={16} /> Upload CCTV Clip
              </button>
              <input 
                ref={fileInputRef} 
                type="file" 
                accept="video/mp4,video/webm" 
                onChange={handleFileUpload} 
                style={{ display: 'none' }} 
              />
            </>
          ) : (
            <button className="btn btn-red" onClick={stopActiveFeed}>
              Stop Feed ({feedSource.toUpperCase()})
            </button>
          )}
        </div>
      </header>

      <div className="dashboard">
        <div>
          <div className="video-container">
            <video ref={videoRef} muted playsInline />
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              onClick={onCanvasClick}
              style={{ cursor: isDrawing ? 'crosshair' : 'default' }}
            />
          </div>

          <div className="controls-bar">
            {!isDrawing ? (
              <button className="btn btn-blue" onClick={() => setIsDrawing(true)}>
                <PlusCircle size={16} /> Draw Hazard Zone
              </button>
            ) : (
              <button className="btn btn-green" onClick={finishZone}>
                <CheckCircle2 size={16} /> Finish Zone ({currentPolygon.length} pts)
              </button>
            )}

            <button className="btn btn-gray" onClick={clearAllZones} style={{ marginLeft: 'auto' }}>
              <RotateCcw size={16} /> Clear Zones
            </button>
          </div>
        </div>

        <div className="sidebar">
          <div className="stat-grid">
            <div className="stat-card">
              <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Tracked Workers</span>
              <div className="stat-val" style={{ color: '#38bdf8' }}>{telemetry.worker_count}</div>
            </div>
            <div className="stat-card">
              <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Active Infractions</span>
              <div className="stat-val" style={{ color: '#ef4444' }}>{telemetry.violation_count}</div>
            </div>
          </div>

          <div className="log-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'between', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171' }}>
                <ShieldAlert size={18} />
                <h4 style={{ fontSize: '0.95rem' }}>Live Violation Feed</h4>
              </div>
              <button 
                onClick={exportCSV} 
                className="btn btn-blue" 
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', marginLeft: 'auto' }}
                title="Export Audit CSV"
              >
                <Download size={14} /> CSV
              </button>
            </div>

            <div className="log-scroll">
              {logs.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '3rem', textAlign: 'center' }}>
                  No infractions detected.
                </p>
              ) : (
                logs.map((l) => (
                  <div key={l.id} className="log-item">
                    {l.thumbnail && <img src={l.thumbnail} alt="Infraction" className="log-thumb" />}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                        <strong style={{ color: '#f1f5f9' }}>Worker #{l.track_id}</strong>
                        <span>{l.time}</span>
                      </div>
                      <div style={{ color: '#fca5a5', marginTop: '2px', fontWeight: 500 }}>
                        {l.reasons.join(' • ')}
                      </div>
                      {l.zone && (
                        <div style={{ color: '#fbbf24', fontSize: '0.72rem', marginTop: '2px' }}>
                          Zone: {l.zone}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
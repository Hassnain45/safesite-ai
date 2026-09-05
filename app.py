import streamlit as st
import numpy as np
from ultralytics import YOLO
from PIL import Image
import tempfile
import os

st.set_page_config(page_title="SafeSite AI", page_icon="🪖", layout="wide")

@st.cache_resource
def load_model():
    paths_to_try = ["backend/models/best.pt", "models/best.pt", "best.pt"]
    for path in paths_to_try:
        if os.path.exists(path):
            return YOLO(path)
    st.error("Model weights file (best.pt) not found! Please check its location in your repository.")
    return None

model = load_model()

st.title("🪖 SafeSite AI: PPE & Geofencing Monitor")
st.sidebar.header("Configuration & Upload")

uploaded_file = st.sidebar.file_uploader("Upload Construction Image/Frame", type=["jpg", "jpeg", "png"])
conf_threshold = st.sidebar.slider("Confidence Threshold", 0.1, 0.9, 0.25, 0.05)

if uploaded_file is not None:
    image = Image.open(uploaded_file).convert("RGB")
    frame = np.array(image)
    
    col1, col2 = st.columns(2)
    with col1:
        worker_metric = st.empty()
    with col2:
        violation_metric = st.empty()

    if model is not None:
        results = model(frame, conf=conf_threshold, verbose=False)[0]
        annotated_frame = results.plot()
        
        boxes = results.boxes
        cls_list = boxes.cls.cpu().numpy() if boxes is not None and boxes.cls is not None else []
        person_count = int(np.sum(cls_list == 5)) if len(cls_list) > 0 else 0
    else:
        annotated_frame = frame
        person_count = 0

    worker_metric.metric("Tracked Workers", person_count)
    violation_metric.metric("Active Infractions", 0, delta_color="inverse")
    
    st.image(annotated_frame, channels="RGB", use_container_width=True)
else:
    st.info("👈 Upload an image using the sidebar to begin PPE tracking.")
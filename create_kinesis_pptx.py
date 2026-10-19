#!/usr/bin/env python3
"""
KINESIS Research Proposal PPTX Generator
=========================================
Generates a 5-slide, visuals-dominant, research-grade PowerPoint presentation
for the KINESIS project: Kinematic Inference through Non-contact Electromagnetic Sensing.

Dark theme · Minimal text · Large visuals · Verified citations in speaker notes
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
import os

# ─── CONSTANTS ──────────────────────────────────────────────────────────
SLIDE_WIDTH = Inches(13.333)
SLIDE_HEIGHT = Inches(7.5)

# Colors — Dark research theme
BG_DARK = RGBColor(0x0B, 0x0E, 0x17)        # Near-black navy
BG_CARD = RGBColor(0x10, 0x15, 0x22)         # Slightly lighter card
ACCENT_CYAN = RGBColor(0x00, 0xE5, 0xCC)     # Electric teal/cyan
ACCENT_CYAN_DIM = RGBColor(0x00, 0x99, 0x88) # Dimmer cyan
ACCENT_BLUE = RGBColor(0x38, 0x8B, 0xFD)     # Bright blue
ACCENT_AMBER = RGBColor(0xFF, 0xB8, 0x00)    # Warm amber
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
LIGHT_GRAY = RGBColor(0xB0, 0xBC, 0xCE)
MID_GRAY = RGBColor(0x6B, 0x7B, 0x93)
DIM_GRAY = RGBColor(0x3A, 0x45, 0x56)
RED_ACCENT = RGBColor(0xFF, 0x4D, 0x6A)
GREEN_ACCENT = RGBColor(0x00, 0xE5, 0x76)

# Image directory
IMG_DIR = os.path.expanduser("~/.gemini/antigravity-cli/brain/2868b8c4-7418-49e8-b8b6-8479045da0e7")

# ─── HELPER FUNCTIONS ───────────────────────────────────────────────────

def set_slide_bg(slide, color=BG_DARK):
    """Set solid background color for a slide."""
    background = slide.background
    fill = background.fill
    fill.solid()
    fill.fore_color.rgb = color


def add_textbox(slide, left, top, width, height, text, font_size=18,
                color=WHITE, bold=False, alignment=PP_ALIGN.LEFT,
                font_name="Calibri", italic=False):
    """Add a simple text box."""
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = text
    p.font.size = Pt(font_size)
    p.font.color.rgb = color
    p.font.bold = bold
    p.font.name = font_name
    p.font.italic = italic
    p.alignment = alignment
    return txBox


def add_multiline_textbox(slide, left, top, width, height, lines, font_name="Calibri"):
    """
    Add a text box with multiple lines.
    lines: list of dicts with keys: text, size, color, bold, italic, alignment, space_after
    """
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True

    for i, line in enumerate(lines):
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        p.text = line.get("text", "")
        p.font.size = Pt(line.get("size", 14))
        p.font.color.rgb = line.get("color", WHITE)
        p.font.bold = line.get("bold", False)
        p.font.name = font_name
        p.font.italic = line.get("italic", False)
        p.alignment = line.get("alignment", PP_ALIGN.LEFT)
        if "space_after" in line:
            p.space_after = Pt(line["space_after"])
        if "space_before" in line:
            p.space_before = Pt(line["space_before"])
    return txBox


def add_rounded_rect(slide, left, top, width, height, fill_color=BG_CARD,
                     border_color=None, border_width=Pt(1)):
    """Add a rounded rectangle shape."""
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill_color
    if border_color:
        shape.line.color.rgb = border_color
        shape.line.width = border_width
    else:
        shape.line.fill.background()
    return shape


def add_rect(slide, left, top, width, height, fill_color=BG_CARD,
             border_color=None, border_width=Pt(1)):
    """Add a rectangle shape."""
    shape = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, left, top, width, height
    )
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill_color
    if border_color:
        shape.line.color.rgb = border_color
        shape.line.width = border_width
    else:
        shape.line.fill.background()
    return shape


def add_image_safe(slide, img_name, left, top, width=None, height=None):
    """Add an image, finding it by searching for the name pattern."""
    # Search for image files matching the name pattern
    for f in os.listdir(IMG_DIR):
        if f.startswith(img_name) and f.endswith('.png'):
            img_path = os.path.join(IMG_DIR, f)
            if width and height:
                return slide.shapes.add_picture(img_path, left, top, width, height)
            elif width:
                return slide.shapes.add_picture(img_path, left, top, width=width)
            elif height:
                return slide.shapes.add_picture(img_path, left, top, height=height)
            else:
                return slide.shapes.add_picture(img_path, left, top)
    print(f"WARNING: Image '{img_name}' not found in {IMG_DIR}")
    return None


def set_speaker_notes(slide, notes_text):
    """Set speaker notes for a slide."""
    notes_slide = slide.notes_slide
    tf = notes_slide.notes_text_frame
    tf.text = notes_text


def add_line(slide, start_x, start_y, end_x, end_y, color=ACCENT_CYAN, width=Pt(1)):
    """Add a line connector."""
    from pptx.util import Emu
    connector = slide.shapes.add_connector(
        1,  # straight connector
        start_x, start_y, end_x, end_y
    )
    connector.line.color.rgb = color
    connector.line.width = width
    return connector


# ─── CREATE PRESENTATION ────────────────────────────────────────────────

prs = Presentation()
prs.slide_width = SLIDE_WIDTH
prs.slide_height = SLIDE_HEIGHT

# Use blank layout
blank_layout = prs.slide_layouts[6]

# ═══════════════════════════════════════════════════════════════════════
# SLIDE 1 — THE IMPOSSIBLE MOUSE
# ═══════════════════════════════════════════════════════════════════════

slide1 = prs.slides.add_slide(blank_layout)
set_slide_bg(slide1)

# Subtle top accent line
add_rect(slide1, Inches(0), Inches(0), SLIDE_WIDTH, Inches(0.04),
         fill_color=ACCENT_CYAN)

# ── Title: KINESIS ──
add_textbox(slide1, Inches(0.6), Inches(0.3), Inches(5.5), Inches(1.2),
            "KINESIS", font_size=64, color=ACCENT_CYAN, bold=True,
            font_name="Calibri")

# ── Subtitle ──
add_multiline_textbox(slide1, Inches(0.6), Inches(1.35), Inches(5.5), Inches(0.9), [
    {"text": "Kinematic Inference through", "size": 16, "color": LIGHT_GRAY, "italic": True},
    {"text": "Non-contact Electromagnetic Sensing", "size": 16, "color": LIGHT_GRAY, "italic": True, "space_after": 8},
])

# ── From Greek kínēsis ──
add_textbox(slide1, Inches(0.6), Inches(2.1), Inches(5), Inches(0.4),
            "from Greek κίνησις — movement, motion", font_size=11,
            color=MID_GRAY, italic=True)

# ── Hero image — centered right ──
add_image_safe(slide1, "slide1_hero_visual", Inches(5.8), Inches(0.4),
               width=Inches(7.2), height=Inches(5.4))

# ── The hook question ──
add_multiline_textbox(slide1, Inches(0.6), Inches(2.7), Inches(5.2), Inches(1.4), [
    {"text": "What if Wi-Fi could see", "size": 26, "color": WHITE, "bold": True},
    {"text": "where your hand is moving?", "size": 26, "color": ACCENT_CYAN, "bold": True, "space_after": 12},
])

# ── NO icons row ──
no_items = [
    ("✕  NO CAMERA", Inches(0.6)),
    ("✕  NO WEARABLE", Inches(2.6)),
    ("✕  NO MOUSE", Inches(4.9)),
]
for text, left in no_items:
    add_rounded_rect(slide1, left, Inches(4.2), Inches(1.9), Inches(0.45),
                     fill_color=RGBColor(0x15, 0x1A, 0x2A), border_color=DIM_GRAY)
    add_textbox(slide1, left + Inches(0.1), Inches(4.23), Inches(1.7), Inches(0.4),
                text, font_size=12, color=RED_ACCENT, bold=True,
                alignment=PP_ALIGN.CENTER)

# ── Research target ──
add_rounded_rect(slide1, Inches(0.6), Inches(5.0), Inches(5.5), Inches(0.55),
                 fill_color=RGBColor(0x0D, 0x1B, 0x2A), border_color=ACCENT_CYAN_DIM)
add_textbox(slide1, Inches(0.8), Inches(5.05), Inches(5.1), Inches(0.5),
            "RESEARCH TARGET  ▸  Continuous 2D pointing from commodity Wi-Fi CSI",
            font_size=12, color=ACCENT_CYAN, bold=True)

# ── Hardware badge ──
add_textbox(slide1, Inches(0.6), Inches(5.75), Inches(5.5), Inches(0.4),
            "2 × ESP32   •   Existing Wi-Fi Router   •   Laptop",
            font_size=11, color=MID_GRAY, alignment=PP_ALIGN.LEFT)

# ── Bottom tagline ──
add_multiline_textbox(slide1, Inches(0.6), Inches(6.3), Inches(12), Inches(0.8), [
    {"text": "THE AIR BECOMES THE MOUSE.", "size": 28, "color": ACCENT_CYAN,
     "bold": True, "alignment": PP_ALIGN.LEFT, "space_after": 2},
    {"text": "Research proposal — One-month undergraduate Embedded Systems project",
     "size": 10, "color": MID_GRAY, "alignment": PP_ALIGN.LEFT},
])

# Speaker notes
set_speaker_notes(slide1, """SLIDE 1 — THE IMPOSSIBLE MOUSE

Key Message: Wi-Fi signals can be used to sense hand movement without any camera, wearable, or physical mouse. The project investigates continuous 2D cursor control using commodity Wi-Fi CSI.

KINESIS = from Greek κίνησις (kínēsis), meaning movement/motion.
Full name: Kinematic Inference through Non-contact Electromagnetic Sensing

Core concept: When a hand moves through a Wi-Fi propagation field, it perturbs multipath reflections. These perturbations appear as measurable changes in Channel State Information (CSI) — amplitude and phase variations across OFDM subcarriers. By processing these CSI changes through signal processing and lightweight estimation, we can infer continuous 2D motion vectors (Δx/Δy) to drive a screen cursor.

Hardware: 2 × ESP32/ESP32-S3 + existing Wi-Fi router + laptop. Total additional cost: ~$10-20.

This is a RESEARCH PROPOSAL — outcomes are hypotheses to be tested, not claimed results.

─── BIBLIOGRAPHY ───
[1] Pu, Q., Gupta, S., Gollakota, S., & Patel, S. (2013). "Whole-Home Gesture Recognition Using Wireless Signals." ACM MobiCom '13. DOI: 10.1145/2500423.2500436
[2] Adib, F., Kabelac, Z., Katabi, D., & Miller, R.C. (2014). "3D Tracking via Body Radio Reflections." USENIX NSDI '14.
[3] Ma, Y., Zhou, G., Wang, S. (2018). "SignFi: Sign Language Recognition Using WiFi." ACM IMWUT.
[4] Zhang, D., Wang, H., Wu, D. (2017). "Toward Centimeter-Scale Human Activity Sensing with Wi-Fi Signals." IEEE Computer.
[5] Yang, J., Chen, X., et al. (2023). "SenseFi: A Library and Benchmark on Deep-Learning-Empowered WiFi Human Sensing." Patterns (Cell Press).
[6] Zheng, Y., Zhang, J., Wang, H., et al. (2021). "Widar3.0: Zero-Effort Cross-Domain Gesture Recognition with Wi-Fi." IEEE TPAMI.
[7] IEEE Std 802.11bf-2025. "Enhancements for Wireless LAN Sensing." Published September 2025.
""")


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 2 — FROM WIFI SIGNAL TO RESEARCH GAP
# ═══════════════════════════════════════════════════════════════════════

slide2 = prs.slides.add_slide(blank_layout)
set_slide_bg(slide2)

# Top accent line
add_rect(slide2, Inches(0), Inches(0), SLIDE_WIDTH, Inches(0.04),
         fill_color=ACCENT_CYAN)

# ── Title ──
add_textbox(slide2, Inches(0.5), Inches(0.2), Inches(7), Inches(0.6),
            "FROM WI-FI SIGNAL TO RESEARCH GAP", font_size=28,
            color=WHITE, bold=True)

add_textbox(slide2, Inches(0.5), Inches(0.7), Inches(8), Inches(0.35),
            "A decade of progress — and the opportunity it reveals",
            font_size=13, color=MID_GRAY, italic=True)

# ── Research evolution image ──
add_image_safe(slide2, "slide2_landscape", Inches(0.3), Inches(1.1),
               width=Inches(7.5), height=Inches(3.5))

# ── Right panel: Key papers ──
paper_y_start = Inches(1.15)
papers = [
    {"tag": "[1]", "ref": "Pu et al., 2013  •  MobiCom", "task": "Whole-home gesture recognition",
     "hw": "USRP SDR", "limit": "Custom SDR, not commodity Wi-Fi", "color": ACCENT_CYAN},
    {"tag": "[2]", "ref": "Adib et al., 2014  •  NSDI", "task": "3D body tracking through walls",
     "hw": "Custom FMCW", "limit": "Specialized RF hardware", "color": ACCENT_CYAN},
    {"tag": "[3]", "ref": "Zhang et al., 2017  •  IEEE Computer", "task": "Fresnel zone CSI model",
     "hw": "Intel 5300 NIC", "limit": "LoS assumption, static geometry", "color": ACCENT_BLUE},
    {"tag": "[4]", "ref": "Ma et al., 2018  •  IMWUT", "task": "276-word sign language recognition",
     "hw": "Intel 5300 NIC", "limit": "Discrete gestures, cross-user drop", "color": ACCENT_BLUE},
    {"tag": "[5]", "ref": "Zheng et al., 2021  •  IEEE TPAMI", "task": "Cross-domain gesture recognition",
     "hw": "Intel 5300 NIC", "limit": "BVP extraction complexity", "color": ACCENT_AMBER},
    {"tag": "[6]", "ref": "Yang et al., 2023  •  Patterns", "task": "Deep learning WiFi benchmark",
     "hw": "Multiple CSI NICs", "limit": "Lab-only datasets, no HCI eval", "color": ACCENT_AMBER},
]

for i, paper in enumerate(papers):
    y = paper_y_start + Inches(i * 0.53)
    # Card background
    add_rounded_rect(slide2, Inches(8.1), y, Inches(4.9), Inches(0.48),
                     fill_color=RGBColor(0x12, 0x17, 0x25),
                     border_color=DIM_GRAY, border_width=Pt(0.5))
    # Tag
    add_textbox(slide2, Inches(8.2), y + Inches(0.02), Inches(0.4), Inches(0.2),
                paper["tag"], font_size=9, color=paper["color"], bold=True)
    # Reference + task
    add_textbox(slide2, Inches(8.6), y + Inches(0.0), Inches(4.2), Inches(0.22),
                paper["ref"], font_size=9, color=WHITE, bold=True)
    add_textbox(slide2, Inches(8.6), y + Inches(0.17), Inches(2.8), Inches(0.18),
                paper["task"], font_size=8, color=LIGHT_GRAY, italic=True)
    add_textbox(slide2, Inches(11.4), y + Inches(0.17), Inches(1.5), Inches(0.35),
                f"▸ {paper['limit']}", font_size=7, color=MID_GRAY)

# ── Bottom: SOLVED vs OPPORTUNITY ──
# Already solved section
add_rounded_rect(slide2, Inches(0.5), Inches(4.9), Inches(5.5), Inches(2.2),
                 fill_color=RGBColor(0x0D, 0x12, 0x1E),
                 border_color=DIM_GRAY, border_width=Pt(0.5))
add_textbox(slide2, Inches(0.7), Inches(4.95), Inches(3), Inches(0.35),
            "✓  ALREADY ESTABLISHED", font_size=14, color=GREEN_ACCENT, bold=True)

solved_items = ["Wi-Fi signals perturbed by human motion",
                "CSI captures fine-grained channel changes",
                "Discrete gesture classification (90%+ accuracy)",
                "Commodity ESP32 CSI extraction",
                "Camera-free / device-free interaction concept"]
for i, item in enumerate(solved_items):
    add_textbox(slide2, Inches(0.9), Inches(5.35) + Inches(i * 0.33), Inches(5), Inches(0.3),
                f"  ✓   {item}", font_size=10, color=LIGHT_GRAY)

# Research opportunity section
add_rounded_rect(slide2, Inches(6.5), Inches(4.9), Inches(6.5), Inches(2.2),
                 fill_color=RGBColor(0x0A, 0x1A, 0x25),
                 border_color=ACCENT_CYAN_DIM, border_width=Pt(1))
add_textbox(slide2, Inches(6.7), Inches(4.95), Inches(4), Inches(0.35),
            "?  UNDEREXPLORED COMBINATION", font_size=14, color=ACCENT_CYAN, bold=True)

gap_items = [
    ("Continuous 2D pointing", "Not discrete gestures — continuous Δx/Δy"),
    ("Geometry-aware sensing", "TX/RX placement affects sensitivity"),
    ("Low-calibration adaptation", "Quick transfer across users/rooms"),
    ("HCI-oriented evaluation", "Pointing error, jitter, latency, throughput"),
]
for i, (title, desc) in enumerate(gap_items):
    y_pos = Inches(5.35) + Inches(i * 0.42)
    add_textbox(slide2, Inches(6.9), y_pos, Inches(3), Inches(0.2),
                f"▸  {title}", font_size=11, color=ACCENT_CYAN, bold=True)
    add_textbox(slide2, Inches(9.5), y_pos, Inches(3.3), Inches(0.2),
                desc, font_size=9, color=MID_GRAY, italic=True)

# ── Research question ──
add_textbox(slide2, Inches(6.7), Inches(7.0), Inches(6.2), Inches(0.4),
            "RQ: Can commodity Wi-Fi CSI be transformed into a low-calibration continuous 2D pointing interface?",
            font_size=9, color=ACCENT_AMBER, bold=True, italic=True)

# Speaker notes
set_speaker_notes(slide2, """SLIDE 2 — FROM WI-FI SIGNAL TO RESEARCH GAP

Key Message: Wi-Fi sensing has evolved significantly over a decade. The foundational science is well-established. The research opportunity lies in an underexplored combination of capabilities.

RESEARCH EVOLUTION:
2013 — WiSee (Pu et al., MobiCom): First whole-home gesture recognition using wireless Doppler. Used expensive USRP SDR, not commodity Wi-Fi. 94% accuracy on 9 gestures. [1]
2014 — WiTrack (Adib et al., NSDI): 3D body tracking via RF reflections. Custom FMCW radio. 10-13cm accuracy. Proved RF can track motion without cameras. [2]
2017 — Fresnel Zone Model (Zhang et al., IEEE Computer): Established physics-based CSI sensing theory using Fresnel zones. Proved centimeter-scale sensing is theoretically possible with commodity Wi-Fi. [3]
2018 — SignFi (Ma et al., IMWUT): 276-word sign language recognition with WiFi CSI using CNN. 93-98% accuracy. But discrete gestures, not continuous tracking. [4]
2021 — Widar3.0 (Zheng et al., IEEE TPAMI): Solved cross-domain gesture recognition using physics-based Body-coordinate Velocity Profile (BVP). >92% cross-domain accuracy. [5]
2023 — SenseFi (Yang et al., Patterns/Cell Press): Comprehensive benchmark library for WiFi sensing. Evaluated MLP, CNN, RNN, Transformers across multiple datasets. [6]
2025 — IEEE 802.11bf: Official WiFi sensing standard published, legitimizing the field. [7]

WHAT'S ALREADY SOLVED:
- Wi-Fi signals are perturbed by human motion ✓
- CSI captures fine-grained channel changes ✓
- Discrete gesture classification at 90%+ accuracy ✓
- Commodity hardware (ESP32) can extract CSI ✓
- Device-free interaction is feasible ✓

WHAT REMAINS UNDEREXPLORED (the combination):
- Continuous 2D pointing (not just discrete gesture classes)
- Geometry-aware sensing (how TX/RX placement affects accuracy)
- Low-calibration adaptation (quick transfer to new users/environments)
- HCI-specific evaluation metrics (pointing error, jitter, latency, throughput)

CRITICAL NOTE: True, unconstrained continuous 2D cursor control via purely commodity Wi-Fi CSI remains an open research challenge as of 2026. Discrete gesture recognition is mature; continuous coordinate-level tracking at mouse-replacement quality is not.

─── BIBLIOGRAPHY ───
[1] Pu, Q., Gupta, S., Gollakota, S., & Patel, S. (2013). "Whole-Home Gesture Recognition Using Wireless Signals." ACM MobiCom '13. DOI: 10.1145/2500423.2500436
[2] Adib, F., Kabelac, Z., Katabi, D., & Miller, R.C. (2014). "3D Tracking via Body Radio Reflections." USENIX NSDI '14.
[3] Zhang, D., Wang, H., Wu, D. (2017). "Toward Centimeter-Scale Human Activity Sensing with Wi-Fi Signals." IEEE Computer, 50(1), pp. 48-57. DOI: 10.1109/MC.2017.7
[4] Ma, Y., Zhou, G., Wang, S. (2018). "SignFi: Sign Language Recognition Using WiFi." ACM IMWUT, 2(1), Article 23. DOI: 10.1145/3191755
[5] Zheng, Y., Zhang, J., Wang, H., et al. (2021). "Widar3.0: Zero-Effort Cross-Domain Gesture Recognition with Wi-Fi." IEEE TPAMI, 44(11), pp. 8671-8688. DOI: 10.1109/TPAMI.2021.3105387
[6] Yang, J., Chen, X., et al. (2023). "SenseFi: A Library and Benchmark on Deep-Learning-Empowered WiFi Human Sensing." Patterns (Cell Press), 4(3). DOI: 10.1016/j.patter.2023.100703
[7] IEEE Std 802.11bf-2025. "IEEE Standard — Enhancements for Wireless LAN Sensing." Published 26 Sept 2025.
""")


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 3 — KINESIS: HOW IT WORKS
# ═══════════════════════════════════════════════════════════════════════

slide3 = prs.slides.add_slide(blank_layout)
set_slide_bg(slide3)

# Top accent line
add_rect(slide3, Inches(0), Inches(0), SLIDE_WIDTH, Inches(0.04),
         fill_color=ACCENT_CYAN)

# ── Title ──
add_textbox(slide3, Inches(0.5), Inches(0.15), Inches(5), Inches(0.5),
            "KINESIS: HOW IT WORKS", font_size=26, color=WHITE, bold=True)

add_textbox(slide3, Inches(5.5), Inches(0.22), Inches(6), Inches(0.35),
            "System Architecture  •  Signal Pipeline  •  Geometry Optimization",
            font_size=11, color=MID_GRAY, italic=True)

# ── Main architecture image — HERO VISUAL ──
add_image_safe(slide3, "slide3_architecture", Inches(0.2), Inches(0.6),
               width=Inches(8.5), height=Inches(6.4))

# ── Right panel: Pipeline annotation ──
# Section: EMBEDDED ACQUISITION
add_rounded_rect(slide3, Inches(8.9), Inches(0.7), Inches(4.1), Inches(1.7),
                 fill_color=RGBColor(0x12, 0x17, 0x25),
                 border_color=ACCENT_CYAN_DIM, border_width=Pt(0.75))
add_textbox(slide3, Inches(9.05), Inches(0.75), Inches(3.5), Inches(0.3),
            "① EMBEDDED ACQUISITION", font_size=13, color=ACCENT_CYAN, bold=True)
add_multiline_textbox(slide3, Inches(9.05), Inches(1.05), Inches(3.8), Inches(1.2), [
    {"text": "2 × ESP32-S3 collect raw CSI", "size": 10, "color": LIGHT_GRAY},
    {"text": "  ▸  OFDM subcarrier amplitudes + phases", "size": 9, "color": MID_GRAY, "space_after": 2},
    {"text": "  ▸  ~100 Hz sampling rate per link", "size": 9, "color": MID_GRAY, "space_after": 2},
    {"text": "  ▸  Stream via UART/UDP to laptop", "size": 9, "color": MID_GRAY},
])

# Section: PC-SIDE PROCESSING
add_rounded_rect(slide3, Inches(8.9), Inches(2.6), Inches(4.1), Inches(2.6),
                 fill_color=RGBColor(0x12, 0x17, 0x25),
                 border_color=ACCENT_BLUE, border_width=Pt(0.75))
add_textbox(slide3, Inches(9.05), Inches(2.65), Inches(3.5), Inches(0.3),
            "② PC-SIDE PROCESSING", font_size=13, color=ACCENT_BLUE, bold=True)

pipeline_steps = [
    ("CSI →", "Raw subcarrier data"),
    ("Denoise →", "Butterworth / Hampel filter"),
    ("Temporal →", "Sliding window, Δ-features"),
    ("Physics →", "Fresnel-zone-inspired features"),
    ("Estimator →", "Lightweight regression / MLP"),
    ("Calibrate →", "Quick per-session adaptation"),
    ("Δx / Δy →", "Continuous motion vector"),
    ("CURSOR", "Screen pointer update"),
]
for i, (step, desc) in enumerate(pipeline_steps):
    y = Inches(2.95) + Inches(i * 0.27)
    add_textbox(slide3, Inches(9.1), y, Inches(1.3), Inches(0.22),
                step, font_size=9, color=ACCENT_CYAN, bold=True)
    add_textbox(slide3, Inches(10.4), y, Inches(2.5), Inches(0.22),
                desc, font_size=9, color=LIGHT_GRAY)

# Section: GEOMETRY MATTERS
add_rounded_rect(slide3, Inches(8.9), Inches(5.4), Inches(4.1), Inches(1.8),
                 fill_color=RGBColor(0x1A, 0x15, 0x0A),
                 border_color=ACCENT_AMBER, border_width=Pt(0.75))
add_textbox(slide3, Inches(9.05), Inches(5.45), Inches(3.5), Inches(0.3),
            "③ KEY INSIGHT: GEOMETRY MATTERS", font_size=13,
            color=ACCENT_AMBER, bold=True)
add_multiline_textbox(slide3, Inches(9.05), Inches(5.8), Inches(3.8), Inches(1.3), [
    {"text": "TX/RX placement changes sensitivity", "size": 10, "color": LIGHT_GRAY, "space_after": 4},
    {"text": "  ✕  Collinear → low spatial diversity", "size": 9, "color": RED_ACCENT},
    {"text": "  ✓  Angled → richer multipath variation", "size": 9, "color": GREEN_ACCENT, "space_after": 6},
    {"text": "Inspired by RIS research (future work)", "size": 8, "color": MID_GRAY, "italic": True},
    {"text": "  Can geometry be optimized without an actual RIS?", "size": 8, "color": ACCENT_AMBER, "italic": True},
])

# Speaker notes
set_speaker_notes(slide3, """SLIDE 3 — KINESIS: HOW IT WORKS (Technical Centerpiece)

SYSTEM ARCHITECTURE:

1. EMBEDDED ACQUISITION (ESP32-S3)
   - Two ESP32-S3 microcontrollers are placed spatially around the user
   - Each collects Wi-Fi CSI — amplitude and phase across OFDM subcarriers
   - ESP-IDF provides native CSI callback API (esp_wifi_set_csi_rx_cb)
   - ~52 subcarriers × ~100 packets/sec per link
   - Raw CSI streamed via UART or UDP to processing laptop

2. WIRELESS PROPAGATION
   - Wi-Fi signals travel via direct path and reflected paths
   - When a hand moves through the propagation field, it perturbs multipath reflections
   - Different subcarriers experience different perturbations (frequency diversity)
   - CSI captures these changes as a subcarrier × time matrix

3. PC-SIDE SIGNAL PROCESSING PIPELINE
   a. CSI Input: Raw amplitude + phase matrix
   b. Denoising: Butterworth low-pass filter, Hampel outlier removal
   c. Temporal Features: Sliding window, first-order differences (Δ-CSI)
   d. Physics-Inspired Features: Fresnel-zone-aware features, CSI ratio, variance profiles
   e. Lightweight Estimator: Simple MLP or ridge regression mapping features → Δx/Δy
   f. Adaptive Calibration: Quick per-session normalization / few-shot adaptation
   g. Output: Continuous motion vector (Δx, Δy) driving screen cursor

4. KEY RESEARCH INSIGHT: GEOMETRY MATTERS
   - The placement of transmitter and receiver fundamentally affects what the CSI "sees"
   - Collinear TX/RX: Low spatial diversity, hand motion along the axis is nearly invisible
   - Angled TX/RX: Richer multipath variation, better sensitivity to 2D motion
   - This insight is inspired by RIS research which optimizes RF propagation environments
   - Our smaller research question: Can we optimize sensing geometry without requiring an actual RIS?
   - RIS is clearly FUTURE WORK — we investigate geometry optimization by physical TX/RX placement

TOOLS & IMPLEMENTATION:
   - ESP-IDF v5.x with CSI support
   - Espressif esp-csi GitHub repository for reference
   - Python (NumPy, SciPy) for signal processing
   - scikit-learn or PyTorch for lightweight estimator
   - PyAutoGUI or similar for cursor control

─── BIBLIOGRAPHY ───
[3] Zhang, D., Wang, H., Wu, D. (2017). "Toward Centimeter-Scale Human Activity Sensing with Wi-Fi Signals." IEEE Computer. — Foundational Fresnel zone model.
[5] Zheng, Y. et al. (2021). "Widar3.0: Zero-Effort Cross-Domain Gesture Recognition." IEEE TPAMI. — Physics-based BVP feature for domain independence.
[6] Yang, J. et al. (2023). "SenseFi: A Library and Benchmark." Patterns. — Benchmark architectures for WiFi sensing.
Jia, S. et al. (2024). "Breaking Coordinate Overfitting: Geometry-Aware WiFi Sensing for Cross-Layout 3D Pose Estimation." arXiv. — Geometry embeddings reduce cross-domain error by 60%.
Liu, J. et al. (2024). "RISAR: RIS-assisted HAR with Commercial Wi-Fi." arXiv. — RIS improves spatial diversity for sensing.
""")


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 4 — CAN IT ACTUALLY WORK?
# ═══════════════════════════════════════════════════════════════════════

slide4 = prs.slides.add_slide(blank_layout)
set_slide_bg(slide4)

# Top accent line
add_rect(slide4, Inches(0), Inches(0), SLIDE_WIDTH, Inches(0.04),
         fill_color=ACCENT_CYAN)

# ── Title ──
add_textbox(slide4, Inches(0.5), Inches(0.15), Inches(6), Inches(0.5),
            "CAN IT ACTUALLY WORK?", font_size=26, color=WHITE, bold=True)
add_textbox(slide4, Inches(6.5), Inches(0.22), Inches(6), Inches(0.35),
            "Experimental Design  •  Hypotheses  •  Evaluation Metrics",
            font_size=11, color=MID_GRAY, italic=True)

# ── Experiment layout image ──
add_image_safe(slide4, "slide4_experiment", Inches(0.2), Inches(0.6),
               width=Inches(6.2), height=Inches(4.7))

# ── Right panel: Hypotheses ──
add_textbox(slide4, Inches(6.7), Inches(0.7), Inches(4), Inches(0.3),
            "TESTABLE HYPOTHESES", font_size=16, color=ACCENT_CYAN, bold=True)

hypotheses = [
    ("H₁", "FEASIBILITY", "Commodity CSI can encode enough information\nfor continuous 2D motion estimation", ACCENT_CYAN),
    ("H₂", "GEOMETRY", "Optimized TX/RX placement reduces\npointing error compared to arbitrary placement", ACCENT_AMBER),
    ("H₃", "ADAPTATION", "Quick per-session calibration improves\ncross-user and cross-position robustness", ACCENT_BLUE),
    ("H₄", "EFFICIENCY", "Physics-inspired features enable lightweight\nestimation without large deep networks", GREEN_ACCENT),
]

for i, (label, title, desc, color) in enumerate(hypotheses):
    y = Inches(1.1) + Inches(i * 1.0)
    # Card
    add_rounded_rect(slide4, Inches(6.7), y, Inches(6.2), Inches(0.88),
                     fill_color=RGBColor(0x12, 0x17, 0x25),
                     border_color=color, border_width=Pt(0.75))
    # Label badge
    add_rounded_rect(slide4, Inches(6.85), y + Inches(0.1), Inches(0.55), Inches(0.32),
                     fill_color=color)
    add_textbox(slide4, Inches(6.85), y + Inches(0.1), Inches(0.55), Inches(0.32),
                label, font_size=11, color=BG_DARK, bold=True,
                alignment=PP_ALIGN.CENTER)
    # Title
    add_textbox(slide4, Inches(7.55), y + Inches(0.07), Inches(2), Inches(0.25),
                title, font_size=12, color=color, bold=True)
    # Description
    add_textbox(slide4, Inches(7.55), y + Inches(0.32), Inches(5.2), Inches(0.52),
                desc, font_size=9, color=LIGHT_GRAY)

# ── Bottom: Controlled Variations ──
add_textbox(slide4, Inches(0.5), Inches(5.45), Inches(5), Inches(0.3),
            "CONTROLLED VARIATIONS", font_size=14, color=WHITE, bold=True)

variations = [
    ("USER", "A → B → C", "Cross-user"),
    ("POSITION", "P1 → P2 → P3", "Spatial"),
    ("GEOMETRY", "G1 → G2 → G3", "TX/RX config"),
    ("ENVIRON", "Room A → Room B", "Cross-env"),
]
for i, (var_name, sequence, var_type) in enumerate(variations):
    x = Inches(0.5) + Inches(i * 1.65)
    add_rounded_rect(slide4, x, Inches(5.8), Inches(1.5), Inches(0.65),
                     fill_color=RGBColor(0x12, 0x17, 0x25),
                     border_color=DIM_GRAY, border_width=Pt(0.5))
    add_textbox(slide4, x + Inches(0.08), Inches(5.82), Inches(1.3), Inches(0.22),
                var_name, font_size=10, color=ACCENT_CYAN, bold=True,
                alignment=PP_ALIGN.CENTER)
    add_textbox(slide4, x + Inches(0.08), Inches(6.0), Inches(1.3), Inches(0.22),
                sequence, font_size=9, color=WHITE, alignment=PP_ALIGN.CENTER)
    add_textbox(slide4, x + Inches(0.08), Inches(6.18), Inches(1.3), Inches(0.2),
                var_type, font_size=8, color=MID_GRAY, alignment=PP_ALIGN.CENTER,
                italic=True)

# ── Bottom: Evaluation Metrics ──
add_textbox(slide4, Inches(7.3), Inches(5.45), Inches(3), Inches(0.3),
            "EVALUATION METRICS", font_size=14, color=WHITE, bold=True)

metrics = [
    ("⊕", "Pointing\nError", ACCENT_CYAN),
    ("〰", "Jitter", ACCENT_BLUE),
    ("◷", "Latency", ACCENT_AMBER),
    ("⇅", "Through-\nput", GREEN_ACCENT),
    ("⏱", "Calibration\nTime", LIGHT_GRAY),
    ("👥", "Cross-User\nRobustness", RED_ACCENT),
]
for i, (icon, label, color) in enumerate(metrics):
    x = Inches(7.3) + Inches(i * 1.0)
    add_textbox(slide4, x, Inches(5.8), Inches(0.5), Inches(0.35),
                icon, font_size=20, color=color, bold=True,
                alignment=PP_ALIGN.CENTER)
    add_textbox(slide4, x - Inches(0.1), Inches(6.15), Inches(0.9), Inches(0.5),
                label, font_size=8, color=LIGHT_GRAY, alignment=PP_ALIGN.CENTER)

# ── Timeline strip ──
add_textbox(slide4, Inches(0.5), Inches(6.7), Inches(2), Inches(0.3),
            "4-WEEK TIMELINE", font_size=12, color=WHITE, bold=True)

weeks = [
    ("W1", "CSI\nAcquisition", ACCENT_CYAN),
    ("W2", "Dataset +\nPipeline", ACCENT_BLUE),
    ("W3", "Model +\nGeometry", ACCENT_AMBER),
    ("W4", "Eval +\nDemo", GREEN_ACCENT),
]
for i, (week, task, color) in enumerate(weeks):
    x = Inches(0.5) + Inches(i * 1.65)
    # Arrow-shaped box
    add_rounded_rect(slide4, x, Inches(7.0), Inches(1.4), Inches(0.4),
                     fill_color=RGBColor(0x12, 0x17, 0x25),
                     border_color=color, border_width=Pt(0.75))
    add_textbox(slide4, x + Inches(0.05), Inches(6.97), Inches(0.35), Inches(0.4),
                week, font_size=10, color=color, bold=True)
    add_textbox(slide4, x + Inches(0.4), Inches(6.97), Inches(0.95), Inches(0.4),
                task, font_size=7, color=LIGHT_GRAY)
    # Arrow between
    if i < 3:
        add_textbox(slide4, x + Inches(1.42), Inches(7.0), Inches(0.2), Inches(0.4),
                    "→", font_size=16, color=MID_GRAY, bold=True)

# ── Bottom note ──
add_textbox(slide4, Inches(7.3), Inches(7.05), Inches(5.5), Inches(0.35),
            "ALL HYPOTHESES & TARGETS — NOT CLAIMED RESULTS",
            font_size=9, color=MID_GRAY, italic=True, alignment=PP_ALIGN.RIGHT)

# Speaker notes
set_speaker_notes(slide4, """SLIDE 4 — CAN IT ACTUALLY WORK? (Experimental Design)

EXPERIMENTAL DESIGN:
The experiment is designed to test four specific, falsifiable hypotheses using controlled variations and standard HCI evaluation metrics.

HAND TRAJECTORIES:
- Horizontal sweeps (left-right)
- Vertical sweeps (up-down)
- Diagonal sweeps
- Slow and fast speeds
- Ground truth captured via simultaneous video (for evaluation only, not part of the sensing system)

CONTROLLED VARIATIONS:
- USER: At least 3 participants (A, B, C) to test cross-user generalization
- POSITION: 3 different seating/standing positions relative to ESP32 devices
- GEOMETRY: 3 different TX/RX configurations (collinear, 90°, 120° separation)
- ENVIRONMENT: 2 different rooms to test environmental robustness

TESTABLE HYPOTHESES:
H₁ (FEASIBILITY): Raw CSI from commodity ESP32 hardware contains sufficient information to estimate continuous 2D motion direction and magnitude. Test by measuring pointing error and comparing to random baseline.

H₂ (GEOMETRY): Optimized transmitter-receiver placement (wider angular separation) yields statistically lower pointing error than arbitrary/collinear placement. Test by comparing error distributions across G1, G2, G3 configurations.

H₃ (ADAPTATION): Quick per-session calibration (a brief initialization gesture) significantly improves performance when switching users or positions. Test by comparing error with/without calibration across users A, B, C.

H₄ (EFFICIENCY): Physics-inspired features (Fresnel-zone-derived, CSI ratio, variance profiles) reduce model complexity without sacrificing accuracy. Test by comparing lightweight estimator with physics features vs. larger deep model with raw CSI.

EVALUATION METRICS (HCI-specific):
- Pointing Error: Euclidean distance between estimated cursor position and ground truth (cm or pixels)
- Jitter: Variance of cursor position when hand is stationary (should be minimal)
- Latency: Time from hand movement to cursor response (target: <200ms for usable interaction)
- Throughput: Effective information transfer rate (bits/s), following Fitts' law methodology where applicable
- Calibration Time: Duration of per-session initialization required
- Cross-User Robustness: Performance degradation when model trained on user A is tested on user B

4-WEEK TIMELINE:
Week 1: Hardware setup, ESP32 CSI acquisition pipeline, data streaming, initial data collection
Week 2: Dataset creation, signal processing pipeline, feature extraction, ground truth alignment
Week 3: Model training, geometry experiments (G1/G2/G3 comparison), adaptation mechanism
Week 4: Full evaluation, demo system integration, documentation, presentation

IMPORTANT: All results are TARGETS and HYPOTHESES to be tested. No results are fabricated or pre-claimed.

─── BIBLIOGRAPHY ───
Zhu, G. et al. (2025). "CSI-Bench: A Large-Scale In-the-Wild Dataset for Multi-task WiFi Sensing." NeurIPS 2025. — 461 hours of CSI, 26 environments, 35 users. Demonstrates severity of domain shift.
Jia, S. et al. (2024). "Breaking Coordinate Overfitting: Geometry-Aware WiFi Sensing." arXiv. — Geometry embeddings reduce cross-domain error by >60%.
""")


# ═══════════════════════════════════════════════════════════════════════
# SLIDE 5 — THE TARGET DEMONSTRATION
# ═══════════════════════════════════════════════════════════════════════

slide5 = prs.slides.add_slide(blank_layout)
set_slide_bg(slide5)

# Top accent line
add_rect(slide5, Inches(0), Inches(0), SLIDE_WIDTH, Inches(0.04),
         fill_color=ACCENT_CYAN)

# ── Title ──
add_textbox(slide5, Inches(0.5), Inches(0.15), Inches(6), Inches(0.5),
            "TARGET DEMONSTRATION", font_size=26, color=WHITE, bold=True)
add_textbox(slide5, Inches(6.5), Inches(0.22), Inches(5), Inches(0.35),
            "The vision  •  Expected contributions  •  Feasibility",
            font_size=11, color=MID_GRAY, italic=True)

# ── Hero demonstration image ──
add_image_safe(slide5, "slide5_demonstration", Inches(0.2), Inches(0.6),
               width=Inches(6.5), height=Inches(4.9))

# ── Right panel: Contribution ──
add_textbox(slide5, Inches(7.0), Inches(0.7), Inches(6), Inches(0.3),
            "PROPOSED CONTRIBUTION", font_size=14, color=ACCENT_CYAN, bold=True)

add_rounded_rect(slide5, Inches(7.0), Inches(1.05), Inches(5.9), Inches(1.05),
                 fill_color=RGBColor(0x0D, 0x1B, 0x2A),
                 border_color=ACCENT_CYAN_DIM, border_width=Pt(0.75))
add_multiline_textbox(slide5, Inches(7.2), Inches(1.1), Inches(5.5), Inches(0.95), [
    {"text": "A lightweight, geometry-aware, and low-calibration", "size": 12, "color": WHITE, "bold": True},
    {"text": "CSI framework for continuous 2D pointing, investigating", "size": 12, "color": WHITE, "bold": True},
    {"text": "how wireless propagation geometry affects practical", "size": 12, "color": WHITE, "bold": True},
    {"text": "HCI performance.", "size": 12, "color": ACCENT_CYAN, "bold": True},
])

# ── Interaction modes ──
add_textbox(slide5, Inches(7.0), Inches(2.3), Inches(3), Inches(0.3),
            "CORE  +  OPTIONAL EXTENSIONS", font_size=12, color=WHITE, bold=True)

modes = [
    ("HAND MOVE", "→  Δx/Δy  →  CURSOR", "Core", ACCENT_CYAN),
    ("PINCH", "→  CLICK", "Optional", ACCENT_AMBER),
    ("HOLD", "→  DRAG", "Optional", ACCENT_AMBER),
    ("SWIPE", "→  SCROLL", "Optional", ACCENT_AMBER),
]
for i, (gesture, action, scope, color) in enumerate(modes):
    y = Inches(2.65) + Inches(i * 0.38)
    add_textbox(slide5, Inches(7.2), y, Inches(1.5), Inches(0.3),
                gesture, font_size=11, color=color, bold=True)
    add_textbox(slide5, Inches(8.7), y, Inches(2.5), Inches(0.3),
                action, font_size=11, color=LIGHT_GRAY)
    add_textbox(slide5, Inches(11.3), y, Inches(1.5), Inches(0.3),
                scope, font_size=9, color=MID_GRAY, italic=True)

# ── Feasibility ──
add_textbox(slide5, Inches(7.0), Inches(4.25), Inches(3), Inches(0.3),
            "HARDWARE REQUIREMENT", font_size=12, color=WHITE, bold=True)

add_rounded_rect(slide5, Inches(7.0), Inches(4.55), Inches(5.9), Inches(0.5),
                 fill_color=RGBColor(0x12, 0x17, 0x25),
                 border_color=GREEN_ACCENT, border_width=Pt(0.75))
add_textbox(slide5, Inches(7.2), Inches(4.58), Inches(5.5), Inches(0.45),
            "2 × ESP32  ≈ $10   +   Existing Wi-Fi Router   +   Existing Laptop",
            font_size=13, color=GREEN_ACCENT, bold=True)

# ── Risks & Fallbacks ──
add_textbox(slide5, Inches(7.0), Inches(5.25), Inches(3), Inches(0.3),
            "RISKS & FALLBACKS", font_size=12, color=WHITE, bold=True)

risks = [
    ("Noisy CSI", "→  Aggressive filtering + subcarrier selection", RED_ACCENT),
    ("Unstable regression", "→  Directional estimation (4/8-way)", RED_ACCENT),
    ("Generalization failure", "→  Controlled per-session adaptation", RED_ACCENT),
]
for i, (risk, fallback, color) in enumerate(risks):
    y = Inches(5.55) + Inches(i * 0.33)
    add_textbox(slide5, Inches(7.2), y, Inches(1.6), Inches(0.28),
                f"⚠  {risk}", font_size=9, color=color)
    add_textbox(slide5, Inches(9.0), y, Inches(3.8), Inches(0.28),
                fallback, font_size=9, color=LIGHT_GRAY)

# ── Future work ──
add_textbox(slide5, Inches(0.5), Inches(5.7), Inches(3), Inches(0.3),
            "FUTURE DIRECTIONS", font_size=12, color=WHITE, bold=True)

future_items = [
    "RIS / programmable RF environments",
    "3D localization + gesture vocabulary",
    "Multi-user interaction",
    "IEEE 802.11bf integration",
]
for i, item in enumerate(future_items):
    add_textbox(slide5, Inches(0.7), Inches(6.0) + Inches(i * 0.28), Inches(4), Inches(0.25),
                f"▹  {item}", font_size=9, color=MID_GRAY)

# ══ THE BIG TAGLINE ══
# Background bar
add_rect(slide5, Inches(0), Inches(6.85), SLIDE_WIDTH, Inches(0.65),
         fill_color=RGBColor(0x05, 0x08, 0x10))

add_textbox(slide5, Inches(0.5), Inches(6.85), Inches(10), Inches(0.5),
            "THE AIR BECOMES THE MOUSE.", font_size=36,
            color=ACCENT_CYAN, bold=True)

add_textbox(slide5, Inches(7.5), Inches(7.15), Inches(5.5), Inches(0.3),
            "TARGET DEMONSTRATION — NOT A CLAIMED ACHIEVED RESULT",
            font_size=9, color=MID_GRAY, italic=True, alignment=PP_ALIGN.RIGHT)

# Speaker notes
set_speaker_notes(slide5, """SLIDE 5 — THE TARGET DEMONSTRATION

THE VISION:
A user sits at a desk with a laptop. Two tiny ESP32 devices are positioned on the desk edges. There is NO camera, NO mouse, NO wearable. The user moves their hand through the air, and the cursor on the screen follows continuously.

PROPOSED CONTRIBUTION (one sentence):
"A lightweight, geometry-aware, and low-calibration CSI framework for continuous 2D pointing, investigating how wireless propagation geometry affects practical HCI performance."

This is an INVESTIGATION, not a claim of achievement.

INTERACTION MODES:
- CORE: Hand movement → Δx/Δy → Cursor tracking (this is the primary research target)
- OPTIONAL EXTENSION: Pinch gesture → Click event
- OPTIONAL EXTENSION: Hold + drag gesture → Drag operation
- OPTIONAL EXTENSION: Swipe gesture → Scroll event
Optional extensions depend on core success and remaining time.

HARDWARE FEASIBILITY:
- 2 × ESP32/ESP32-S3: ~$5-10 each (already low-cost commodity hardware)
- Existing Wi-Fi router (already present in any indoor environment)
- Existing laptop (any modern laptop with Python support)
- Total additional investment: approximately $10-20
- No custom RF front-end, no expensive SDR, no specialized equipment

RISKS & MITIGATION:
1. NOISY CSI: Wi-Fi CSI is inherently noisy due to environmental multipath.
   → Mitigation: Butterworth filtering, Hampel outlier removal, subcarrier selection, CSI ratio technique
2. UNSTABLE REGRESSION: Continuous coordinate regression may produce erratic predictions.
   → Fallback: Reduce to directional estimation (4-way or 8-way classification) — still valuable as a research finding
3. GENERALIZATION FAILURE: Model may not transfer across users/environments.
   → Mitigation: Per-session calibration with brief initialization gestures + physics-informed features for domain independence

FUTURE DIRECTIONS (clearly beyond this project's scope):
- RIS / Programmable RF Environments: Actual reconfigurable intelligent surfaces for dynamic propagation control
- 3D Localization: Extending from 2D pointing to 3D hand tracking
- Multi-User Interaction: Handling multiple simultaneous users
- IEEE 802.11bf: Leveraging the new Wi-Fi sensing standard for standardized CSI access

SUCCESS CRITERIA (targets, not claimed results):
- Continuous cursor movement that visibly follows hand direction
- Pointing error within an acceptable range for coarse interaction
- Latency below 200ms for responsive interaction feel
- Measurable improvement through geometry optimization
- Improved cross-user robustness through calibration/adaptation

─── COMPLETE BIBLIOGRAPHY ───

[1] Pu, Q., Gupta, S., Gollakota, S., & Patel, S. (2013). "Whole-Home Gesture Recognition Using Wireless Signals." Proceedings of ACM MobiCom '13, pp. 27-38. DOI: 10.1145/2500423.2500436

[2] Adib, F., Kabelac, Z., Katabi, D., & Miller, R.C. (2014). "3D Tracking via Body Radio Reflections." Proceedings of USENIX NSDI '14, pp. 317-329.

[3] Zhang, D., Wang, H., Wu, D. (2017). "Toward Centimeter-Scale Human Activity Sensing with Wi-Fi Signals." IEEE Computer, 50(1), pp. 48-57. DOI: 10.1109/MC.2017.7

[4] Ma, Y., Zhou, G., Wang, S., Zhao, H., & Jung, W. (2018). "SignFi: Sign Language Recognition Using WiFi." Proceedings of the ACM on Interactive, Mobile, Wearable and Ubiquitous Technologies (IMWUT), 2(1), Article 23. DOI: 10.1145/3191755

[5] Zheng, Y., Zhang, J., Wang, H., et al. (2021). "Widar3.0: Zero-Effort Cross-Domain Gesture Recognition with Wi-Fi." IEEE Transactions on Pattern Analysis and Machine Intelligence (TPAMI), 44(11), pp. 8671-8688. DOI: 10.1109/TPAMI.2021.3105387

[6] Yang, J., Chen, X., Wang, D., Zou, H., Lu, C.X., Sun, S., & Xie, L. (2023). "SenseFi: A Library and Benchmark on Deep-Learning-Empowered WiFi Human Sensing." Patterns (Cell Press), 4(3). DOI: 10.1016/j.patter.2023.100703

[7] IEEE Std 802.11bf-2025. "IEEE Standard for Information Technology — Enhancements for Wireless LAN Sensing." Published 26 September 2025.

[8] Jia, S., et al. (2024). "Breaking Coordinate Overfitting: Geometry-Aware WiFi Sensing for Cross-Layout 3D Pose Estimation (PerceptAlign)." arXiv preprint arXiv:2403.04278.

[9] Liu, J., Huang, Y., et al. (2024). "RISAR: RIS-assisted Human Activity Recognition with Commercial Wi-Fi Devices." arXiv preprint arXiv:2402.17387.

[10] Zhu, G., et al. (2025). "CSI-Bench: A Large-Scale In-the-Wild Dataset for Multi-task WiFi Sensing." NeurIPS 2025. GitHub: guozhen-jenn-zhu/CSI-Bench-Real-WiFi-Sensing-Benchmark.

[11] Chung, W.-Y., Shen, L.-H., et al. (2023). "WiRiS: Transformer for RIS-Assisted Device-Free Sensing for Joint People Counting and Localization using Wi-Fi CSI." IEEE PIMRC 2023. arXiv:2307.01455.
""")


# ─── SAVE ───────────────────────────────────────────────────────────────

output_path = "KINESIS_Research_Proposal.pptx"
prs.save(output_path)
print(f"✅ KINESIS Research Proposal saved to: {output_path}")
print(f"   Slides: {len(prs.slides)}")
print(f"   Format: Widescreen 16:9 ({SLIDE_WIDTH} × {SLIDE_HEIGHT})")

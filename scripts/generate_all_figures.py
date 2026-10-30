import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.patches import FancyBboxPatch, Rectangle, Circle, Polygon
import numpy as np

OUTPUT_DIR = r"d:\spidy\YOLO\report_figures"
os.makedirs(OUTPUT_DIR, exist_ok=True)

plt.rcParams['font.family'] = 'DejaVu Sans'
plt.rcParams['font.size'] = 10

# -------------------------------------------------------------
# Figure 2.1: Project Timeline and Phase-wise Gantt Chart
# -------------------------------------------------------------
def generate_fig_2_1():
    fig, ax = plt.subplots(figsize=(10, 5), dpi=300)
    
    phases = [
        ("Phase 1: Inception & Setup", "2026-07-15", 30, "#1E3A8A"),
        ("Phase 2: Core ML Pipeline (ASR & Diarization)", "2026-08-16", 35, "#2563EB"),
        ("Phase 3: Knowledge Graph & DCA v1", "2026-09-15", 25, "#0D9488"),
        ("Phase 4: DCA v2 Gating & Policy Grounding", "2026-10-08", 15, "#D97706"),
        ("Phase 5: React UI, Live Studio & Final Validation", "2026-10-18", 11, "#DC2626")
    ]
    
    y_pos = np.arange(len(phases))
    start_days = [0, 32, 62, 85, 95]
    durations = [31, 35, 25, 14, 11]
    
    for i, (name, start_date, dur, color) in enumerate(phases):
        ax.barh(i, durations[i], left=start_days[i], height=0.55, align='center',
                color=color, edgecolor='#1F2937', linewidth=1.2, alpha=0.9)
        # Add text label inside or next to bar
        ax.text(start_days[i] + durations[i]/2, i, f"{durations[i]} Days",
                ha='center', va='center', color='white', fontweight='bold', fontsize=9)
        
    ax.set_yticks(y_pos)
    ax.set_yticklabels([p[0] for p in phases], fontweight='bold', fontsize=9.5)
    ax.invert_yaxis()
    ax.set_xlabel("Project Timeline (July 15, 2026 - October 28, 2026) [Days from Start]", fontweight='bold')
    ax.set_title("Figure 2.1: Project Timeline and Phase-wise Gantt Chart", fontweight='bold', pad=15, fontsize=12)
    
    # Milestone lines
    ax.axvline(x=31, color='gray', linestyle='--', alpha=0.6)
    ax.axvline(x=67, color='gray', linestyle='--', alpha=0.6)
    ax.axvline(x=87, color='gray', linestyle='--', alpha=0.6)
    ax.axvline(x=106, color='#DC2626', linestyle='-', linewidth=2)
    ax.text(106, 4.4, 'Review 3\nSubmission', color='#DC2626', fontweight='bold', ha='center', fontsize=8.5)
    
    ax.grid(axis='x', linestyle=':', alpha=0.7)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_2_1_gantt.png"))
    plt.close()
    print("Generated Fig 2.1")

# -------------------------------------------------------------
# Figure 4.1: High-Level End-to-End System Architecture
# -------------------------------------------------------------
def generate_fig_4_1():
    fig, ax = plt.subplots(figsize=(11, 7), dpi=300)
    ax.set_xlim(0, 11)
    ax.set_ylim(0, 8)
    ax.axis('off')
    
    # Tier 1: Client & Ingestion Layer
    box_client = FancyBboxPatch((0.5, 5.8), 10, 1.8, boxstyle="round,pad=0.2",
                                facecolor="#EFF6FF", edgecolor="#3B82F6", linewidth=2)
    ax.add_patch(box_client)
    ax.text(0.7, 7.3, "TIER 1: CLIENT & MULTI-MODAL INGESTION LAYER (React 18 + TypeScript + Vite)",
            fontweight='bold', color="#1E3A8A", fontsize=10.5)
    
    c_sub = [
        ("Live Studio Mic\n(WebRTC Stream)", 1.0, "#DBEAFE"),
        ("Audio/Video Upload\n(WAV, MP3, WebM)", 3.5, "#DBEAFE"),
        ("Policy Document Store\n(PDF, DOCX Charters)", 6.0, "#DBEAFE"),
        ("Interactive UI\n(Cytoscape Graph & Alerts)", 8.5, "#DBEAFE")
    ]
    for text, x, col in c_sub:
        b = FancyBboxPatch((x, 6.0), 2.0, 1.0, boxstyle="round,pad=0.1", facecolor=col, edgecolor="#2563EB")
        ax.add_patch(b)
        ax.text(x+1.0, 6.5, text, ha='center', va='center', fontsize=8.5, fontweight='bold', color="#1E40AF")
        
    # Tier 2: Intelligence & Auditing Pipeline (FastAPI)
    box_ai = FancyBboxPatch((0.5, 2.7), 10, 2.7, boxstyle="round,pad=0.2",
                            facecolor="#F0FDF4", edgecolor="#10B981", linewidth=2)
    ax.add_patch(box_ai)
    ax.text(0.7, 5.1, "TIER 2: SOVEREIGN INTELLIGENCE & AUDITING ENGINE (Local Edge Multi-Core)",
            fontweight='bold', color="#065F46", fontsize=10.5)
    
    ai_mods = [
        ("Faster-Whisper INT8\n(Local ASR Engine)", 0.8, 3.8, 2.1, 0.9, "#D1FAE5"),
        ("Acoustic Diarizer\n(F0 Pitch & FFT Timbre)", 3.2, 3.8, 2.2, 0.9, "#D1FAE5"),
        ("DistilBERT Classifier\n(tau_clf = 0.30)", 5.7, 3.8, 2.2, 0.9, "#D1FAE5"),
        ("Phi-3.5 3.8B SLM\n(JSON Tuple Extraction)", 8.2, 3.8, 2.1, 0.9, "#D1FAE5"),
        ("BGE-Large Embedder\n(1024-d Dense Vector)", 1.8, 2.9, 2.3, 0.7, "#FEF3C7"),
        ("DCA v2 Consistency Auditor\n(Cosine Gate >= 0.65 & BART-MNLI Stance)", 4.5, 2.9, 5.8, 0.7, "#FEE2E2")
    ]
    for text, x, y, w, h, col in ai_mods:
        b = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.1", facecolor=col, edgecolor="#059669" if "D1FA" in col else "#B91C1C" if "FEE2" in col else "#D97706")
        ax.add_patch(b)
        ax.text(x+w/2, y+h/2, text, ha='center', va='center', fontsize=8, fontweight='bold', color="#1F2937")
        
    # Tier 3: Sovereign Storage Tier
    box_store = FancyBboxPatch((0.5, 0.4), 10, 1.8, boxstyle="round,pad=0.2",
                               facecolor="#FAF5FF", edgecolor="#8B5CF6", linewidth=2)
    ax.add_patch(box_store)
    ax.text(0.7, 1.9, "TIER 3: SOVEREIGN PERSISTENCE & AUDIT LOG STORE (Neo4j Graph Database)",
            fontweight='bold', color="#5B21B6", fontsize=10.5)
    
    s_mods = [
        ("Neo4j Dynamic Property Graph\n(:Decision, :Meeting, :Topic)", 1.0, "#EDE9FE"),
        ("1024-d Cosine Vector Index\n(Scoring & Top-K Retrieval)", 4.4, "#EDE9FE"),
        ("Verified Document Proof Store\n(Grounded Policy Clauses)", 7.8, "#EDE9FE")
    ]
    for text, x, col in s_mods:
        b = FancyBboxPatch((x, 0.6), 2.8, 1.0, boxstyle="round,pad=0.1", facecolor=col, edgecolor="#7C3AED")
        ax.add_patch(b)
        ax.text(x+1.4, 1.1, text, ha='center', va='center', fontsize=8.5, fontweight='bold', color="#4C1D95")
        
    # Connection Arrows
    ax.annotate("", xy=(5.5, 5.8), xytext=(5.5, 5.4),
                arrowprops=dict(arrowstyle="->", color="#1F2937", lw=1.5))
    ax.annotate("", xy=(5.5, 2.7), xytext=(5.5, 2.2),
                arrowprops=dict(arrowstyle="->", color="#1F2937", lw=1.5))
    ax.annotate("", xy=(8.5, 2.2), xytext=(8.5, 5.8),
                arrowprops=dict(arrowstyle="<-", color="#2563EB", lw=1.5, linestyle="--"))
    ax.text(8.7, 4.0, "Real-Time Alerts &\nGraph Updates", color="#2563EB", fontsize=8, fontweight='bold')
    
    ax.set_title("Figure 4.1: High-Level End-to-End System Architecture", fontweight='bold', fontsize=12, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_4_1_architecture.png"))
    plt.close()
    print("Generated Fig 4.1")

# -------------------------------------------------------------
# Figure 4.2: DFD Level 0 (Context Level)
# -------------------------------------------------------------
def generate_fig_4_2():
    fig, ax = plt.subplots(figsize=(9, 4.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5)
    ax.axis('off')
    
    # Entity: Stakeholder
    b1 = FancyBboxPatch((0.5, 1.8), 2.2, 1.4, boxstyle="round,pad=0.1", facecolor="#E0F2FE", edgecolor="#0284C7", lw=2)
    ax.add_patch(b1)
    ax.text(1.6, 2.5, "Enterprise\nStakeholders /\nCouncil", ha='center', va='center', fontweight='bold', fontsize=9.5)
    
    # Process 0: Auditor
    c0 = Circle((5.0, 2.5), 1.3, facecolor="#FEF3C7", edgecolor="#D97706", lw=2)
    ax.add_patch(c0)
    ax.text(5.0, 2.5, "0.0\nMultimodal\nMeeting-to-Decision\nAuditor", ha='center', va='center', fontweight='bold', fontsize=9)
    
    # Data Store: Neo4j
    b2 = Rectangle((7.8, 1.8), 1.8, 1.4, facecolor="#EDE9FE", edgecolor="#7C3AED", lw=2)
    ax.add_patch(b2)
    ax.text(8.7, 2.5, "D1 | Neo4j\nDynamic\nKnowledge Graph", ha='center', va='center', fontweight='bold', fontsize=9)
    
    # Data flows
    # User -> System
    ax.annotate("1. Spoken Audio / Transcripts\n2. Corporate Policy Docs", xy=(3.7, 2.8), xytext=(2.7, 2.8),
                arrowprops=dict(arrowstyle="->", lw=1.5, color="#1F2937"), fontsize=8, ha='center', va='bottom')
    # System -> User
    ax.annotate("3. Real-Time Contradiction Alerts\n4. Interactive Topic Subgraphs", xy=(2.7, 2.2), xytext=(3.7, 2.2),
                arrowprops=dict(arrowstyle="->", lw=1.5, color="#DC2626"), fontsize=8, ha='center', va='top')
    # System <-> Store
    ax.annotate("5. Cypher Writes &\nVector Projections", xy=(7.8, 2.8), xytext=(6.3, 2.8),
                arrowprops=dict(arrowstyle="->", lw=1.5, color="#1F2937"), fontsize=8, ha='center', va='bottom')
    ax.annotate("6. Historical Policy\nRules Retrieval", xy=(6.3, 2.2), xytext=(7.8, 2.2),
                arrowprops=dict(arrowstyle="->", lw=1.5, color="#059669"), fontsize=8, ha='center', va='top')

    ax.set_title("Figure 4.2: Data Flow Diagram (Level 0 - Context Level)", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_4_2_dfd_lvl0.png"))
    plt.close()
    print("Generated Fig 4.2")

# -------------------------------------------------------------
# Figure 4.3: DFD Level 1 (Pipeline Orchestration)
# -------------------------------------------------------------
def generate_fig_4_3():
    fig, ax = plt.subplots(figsize=(10, 6), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis('off')
    
    procs = [
        ("1.0 ASR & Acoustic\nDiarization", 1.2, 4.8),
        ("2.0 Utterance Filter &\nPhi-3.5 Extraction", 4.0, 4.8),
        ("3.0 Vector Embedding &\nCandidate Retrieval", 6.8, 4.8),
        ("4.0 DCA v2 Semantic\nStance Auditing", 6.8, 2.2),
        ("5.0 Graph Commitment &\nUI Alert Dispatch", 3.0, 2.2)
    ]
    
    for text, x, y in procs:
        c = Circle((x, y), 0.95, facecolor="#DBEAFE", edgecolor="#2563EB", lw=2)
        ax.add_patch(c)
        ax.text(x, y, text, ha='center', va='center', fontweight='bold', fontsize=8)
        
    # Data stores
    d1 = Rectangle((0.5, 1.8), 1.5, 0.8, facecolor="#EDE9FE", edgecolor="#7C3AED", lw=1.8)
    ax.add_patch(d1)
    ax.text(1.25, 2.2, "D1: Neo4j Graph\n& Vector Store", ha='center', va='center', fontsize=8, fontweight='bold')
    
    # Flows
    ax.annotate("Audio Slices", xy=(0.25, 4.8), xytext=(0.0, 4.8), arrowprops=dict(arrowstyle="->", lw=1.5))
    ax.annotate("Attributed\nUtterances", xy=(3.05, 4.8), xytext=(2.15, 4.8),
                arrowprops=dict(arrowstyle="->", lw=1.5), fontsize=7.5, ha='center', va='bottom')
    ax.annotate("Decision Tuples\n(Text, Rationale)", xy=(5.85, 4.8), xytext=(4.95, 4.8),
                arrowprops=dict(arrowstyle="->", lw=1.5), fontsize=7.5, ha='center', va='bottom')
    ax.annotate("Candidate\nPairs", xy=(6.8, 3.15), xytext=(6.8, 3.85),
                arrowprops=dict(arrowstyle="->", lw=1.5), fontsize=7.5, ha='right', va='center')
    ax.annotate("Stance Score &\nAlert Verdicts", xy=(3.95, 2.2), xytext=(5.85, 2.2),
                arrowprops=dict(arrowstyle="->", lw=1.5), fontsize=7.5, ha='center', va='bottom')
    ax.annotate("Upsert\nRelational Edges", xy=(2.0, 2.2), xytext=(2.05, 2.2),
                arrowprops=dict(arrowstyle="->", lw=1.5), fontsize=7.5, ha='center', va='bottom')
    
    ax.annotate("Top-K Lookup", xy=(6.8, 4.8), xytext=(1.5, 2.6),
                arrowprops=dict(arrowstyle="<-", lw=1.2, linestyle="--", color="#059669"), fontsize=7.5)
    
    ax.annotate("Render Alerts &\nTopic Subgraphs", xy=(3.0, 1.2), xytext=(3.0, 0.6),
                arrowprops=dict(arrowstyle="<-", lw=1.5, color="#DC2626"), fontsize=8, fontweight='bold', ha='center')

    ax.set_title("Figure 4.3: Data Flow Diagram (Level 1 - Pipeline Orchestration)", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_4_3_dfd_lvl1.png"))
    plt.close()
    print("Generated Fig 4.3")

# -------------------------------------------------------------
# Figure 4.4: DFD Level 2 (DCA v2 Subsystem)
# -------------------------------------------------------------
def generate_fig_4_4():
    fig, ax = plt.subplots(figsize=(10, 6.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 7.5)
    ax.axis('off')
    
    boxes = [
        ("New Proposed Decision Tuple", 0.5, 6.2, 3.0, 0.8, "#EFF6FF", "#3B82F6"),
        ("Stage 1: Topic Domain Gate\n(Disjoint non-generic topics?)", 4.5, 6.2, 3.5, 0.8, "#FEF3C7", "#D97706"),
        ("Suppress Conflict (Domain Isolated)", 8.2, 5.0, 1.6, 0.7, "#E5E7EB", "#6B7280"),
        ("Stage 2: Same-Subject Cosine Gate\n(CosineSim(d_new, d_cand) >= 0.65)", 4.5, 4.8, 3.5, 0.8, "#FEF3C7", "#D97706"),
        ("Suppress Conflict (Distinct Subjects)", 8.2, 3.6, 1.6, 0.7, "#E5E7EB", "#6B7280"),
        ("Stage 3: NLI Cross-Encoder Stance\n(BART-MNLI Entailment vs Contradiction)", 4.5, 3.4, 3.5, 0.8, "#FEE2E2", "#DC2626"),
        ("Stage 4: Recency Decay & Justification Check\n(w_recency * Stance_raw)", 4.5, 2.0, 3.5, 0.8, "#D1FAE5", "#059669"),
        ("CRITICAL CONTRADICTION\n(Stance < -0.30 & Unjustified)", 0.8, 0.5, 2.6, 0.9, "#FEE2E2", "#DC2626"),
        ("POLICY SUPERSEDES\n(Stance > 0.30 & References Prior)", 4.0, 0.5, 2.6, 0.9, "#FEF3C7", "#D97706"),
        ("POLICY REAFFIRMS\n(Stance >= -0.30 Aligned)", 7.2, 0.5, 2.4, 0.9, "#D1FAE5", "#059669")
    ]
    
    for text, x, y, w, h, bg, border in boxes:
        b = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.1", facecolor=bg, edgecolor=border, lw=1.8)
        ax.add_patch(b)
        ax.text(x+w/2, y+h/2, text, ha='center', va='center', fontsize=8, fontweight='bold', color="#1F2937")
        
    # Connectors
    ax.annotate("", xy=(4.5, 6.6), xytext=(3.5, 6.6), arrowprops=dict(arrowstyle="->", lw=1.5))
    ax.annotate("Yes (Disjoint)", xy=(8.2, 5.4), xytext=(6.5, 6.2), arrowprops=dict(arrowstyle="->", lw=1.2, color="#6B7280"))
    ax.annotate("No (Same / General)", xy=(6.25, 5.6), xytext=(6.25, 6.2), arrowprops=dict(arrowstyle="->", lw=1.5))
    ax.annotate("No (< 0.65)", xy=(8.2, 4.0), xytext=(6.5, 4.8), arrowprops=dict(arrowstyle="->", lw=1.2, color="#6B7280"))
    ax.annotate("Yes (>= 0.65)", xy=(6.25, 4.2), xytext=(6.25, 4.8), arrowprops=dict(arrowstyle="->", lw=1.5))
    ax.annotate("", xy=(6.25, 2.8), xytext=(6.25, 3.4), arrowprops=dict(arrowstyle="->", lw=1.5))
    
    # Branches to 3 outcomes
    ax.annotate("", xy=(2.1, 1.4), xytext=(5.0, 2.0), arrowprops=dict(arrowstyle="->", lw=1.5, color="#DC2626"))
    ax.annotate("", xy=(5.3, 1.4), xytext=(6.25, 2.0), arrowprops=dict(arrowstyle="->", lw=1.5, color="#D97706"))
    ax.annotate("", xy=(8.4, 1.4), xytext=(7.5, 2.0), arrowprops=dict(arrowstyle="->", lw=1.5, color="#059669"))

    ax.set_title("Figure 4.4: Data Flow Diagram (Level 2 - DCA v2 Auditing Subsystem)", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_4_4_dfd_lvl2.png"))
    plt.close()
    print("Generated Fig 4.4")

# -------------------------------------------------------------
# Figure 4.5: UML Use Case Diagram
# -------------------------------------------------------------
def generate_fig_4_5():
    fig, ax = plt.subplots(figsize=(9.5, 6), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 7)
    ax.axis('off')
    
    # System boundary box
    sys_box = Rectangle((2.8, 0.4), 6.8, 6.2, facecolor="#F8FAFC", edgecolor="#475569", lw=2, linestyle="--")
    ax.add_patch(sys_box)
    ax.text(6.2, 6.3, "Multimodal Meeting-to-Decision Auditor", ha='center', va='center', fontweight='bold', fontsize=11)
    
    # Actors
    actors = [
        ("Executive /\nBoard Member", 1.0, 5.0),
        ("Compliance /\nLegal Auditor", 1.0, 3.2),
        ("Organization\nAdmin", 1.0, 1.4)
    ]
    for name, x, y in actors:
        # stick figure head
        ax.add_patch(Circle((x, y+0.4), 0.22, facecolor="#38BDF8", edgecolor="#0284C7", lw=1.5))
        ax.plot([x, x], [y+0.18, y-0.2], color="#0284C7", lw=2) # body
        ax.plot([x-0.2, x+0.2], [y+0.05, y+0.05], color="#0284C7", lw=2) # arms
        ax.plot([x, x-0.2], [y-0.2, y-0.45], color="#0284C7", lw=2) # left leg
        ax.plot([x, x+0.2], [y-0.2, y-0.45], color="#0284C7", lw=2) # right leg
        ax.text(x, y-0.7, name, ha='center', va='top', fontweight='bold', fontsize=8)
        
    # Use cases
    ucs = [
        ("UC1: Authenticate & Select Org Workspace", 6.2, 5.8),
        ("UC2: Stream Real-Time Meeting Audio", 4.8, 4.9),
        ("UC3: Upload Batch Audio & Policy PDFs", 7.6, 4.9),
        ("UC4: View Contradiction Alerts & Verdicts", 4.8, 3.8),
        ("UC5: Explore Dynamic Knowledge Graph", 7.6, 3.8),
        ("UC6: Review AI Document Proof Grounding", 4.8, 2.6),
        ("UC7: Resolve Alerts (Approve / Reject)", 7.6, 2.6),
        ("UC8: Manage Multi-Tenant Subgraphs", 6.2, 1.2)
    ]
    
    for name, x, y in ucs:
        e = FancyBboxPatch((x-1.6, y-0.35), 3.2, 0.7, boxstyle="round,pad=0.15", facecolor="#EFF6FF", edgecolor="#2563EB", lw=1.5)
        ax.add_patch(e)
        ax.text(x, y, name, ha='center', va='center', fontsize=7.5, fontweight='bold', color="#1E3A8A")
        
    # Associations
    ax.plot([1.2, 3.2], [5.0, 5.8], color="#64748B", lw=1.2)
    ax.plot([1.2, 3.2], [5.0, 4.9], color="#64748B", lw=1.2)
    ax.plot([1.2, 3.2], [5.0, 3.8], color="#64748B", lw=1.2)
    ax.plot([1.2, 6.0], [5.0, 3.8], color="#64748B", lw=1.2)
    
    ax.plot([1.2, 3.2], [3.2, 5.8], color="#64748B", lw=1.2)
    ax.plot([1.2, 6.0], [3.2, 4.9], color="#64748B", lw=1.2)
    ax.plot([1.2, 3.2], [3.2, 3.8], color="#64748B", lw=1.2)
    ax.plot([1.2, 3.2], [3.2, 2.6], color="#64748B", lw=1.2)
    ax.plot([1.2, 6.0], [3.2, 2.6], color="#64748B", lw=1.2)
    
    ax.plot([1.2, 3.2], [1.4, 5.8], color="#64748B", lw=1.2)
    ax.plot([1.2, 4.6], [1.4, 1.2], color="#64748B", lw=1.2)

    ax.set_title("Figure 4.5: UML Use Case Diagram for Stakeholder Roles", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_4_5_use_case.png"))
    plt.close()
    print("Generated Fig 4.5")

# -------------------------------------------------------------
# Figure 4.6: System Class Diagram
# -------------------------------------------------------------
def generate_fig_4_6():
    fig, ax = plt.subplots(figsize=(10, 6.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 7)
    ax.axis('off')
    
    classes = [
        ("Organization", ["+ org_id: String", "+ org_name: String", "+ meetings: List", "+ documents: List"], 0.6, 4.8, 2.5, 1.8),
        ("Meeting", ["+ meeting_id: String", "+ title: String", "+ date: Date", "+ utterances: List", "+ decisions: List"], 3.8, 4.8, 2.6, 1.8),
        ("PolicyDocument", ["+ doc_id: String", "+ title: String", "+ category: String", "+ full_text: String", "+ verified_by: String"], 7.0, 4.8, 2.5, 1.8),
        ("Utterance", ["+ speaker: String", "+ text: String", "+ start: Float", "+ end: Float", "+ is_decision: Boolean"], 0.6, 1.5, 2.5, 1.8),
        ("Decision", ["+ decision_id: String", "+ text: String", "+ justification: String", "+ status: String", "+ embedding: List"], 3.8, 1.5, 2.6, 2.0),
        ("DCAv2Auditor", ["+ sim_thresh: Float = 0.65", "+ contra_thresh: -0.30", "+ evaluate()", "+ compute_stance()"], 7.0, 1.5, 2.5, 1.8)
    ]
    
    for title, fields, x, y, w, h in classes:
        # Header
        h_box = Rectangle((x, y+h-0.45), w, 0.45, facecolor="#1E3A8A", edgecolor="#1E3A8A")
        ax.add_patch(h_box)
        ax.text(x+w/2, y+h-0.22, title, ha='center', va='center', fontweight='bold', color='white', fontsize=9)
        # Body
        b_box = Rectangle((x, y), w, h-0.45, facecolor="#F8FAFC", edgecolor="#1E3A8A", lw=1.2)
        ax.add_patch(b_box)
        for idx, f in enumerate(fields):
            ax.text(x+0.12, y+h-0.75 - idx*0.25, f, va='center', fontsize=7.5, color="#1F2937")
            
    # Relationships
    ax.annotate("1..*", xy=(3.8, 5.7), xytext=(3.1, 5.7), arrowprops=dict(arrowstyle="->", lw=1.5), fontsize=8, fontweight='bold')
    ax.annotate("1..*", xy=(7.0, 5.7), xytext=(3.1, 6.2), arrowprops=dict(arrowstyle="->", lw=1.5, linestyle=":"), fontsize=8, fontweight='bold')
    ax.annotate("contains", xy=(3.8, 2.4), xytext=(4.5, 4.8), arrowprops=dict(arrowstyle="->", lw=1.5), fontsize=8)
    ax.annotate("consists_of", xy=(1.8, 3.3), xytext=(4.2, 4.8), arrowprops=dict(arrowstyle="->", lw=1.5), fontsize=8)
    ax.annotate("CONTRADICTS /\nSUPERSEDES", xy=(6.4, 2.4), xytext=(7.0, 2.4), arrowprops=dict(arrowstyle="<->", lw=1.5, color="#DC2626"), fontsize=7.5)

    ax.set_title("Figure 4.6: System Class Diagram showing Domain Entities and Interfaces", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_4_6_class_diagram.png"))
    plt.close()
    print("Generated Fig 4.6")

# -------------------------------------------------------------
# Figure 4.7: Sequence Diagram
# -------------------------------------------------------------
def generate_fig_4_7():
    fig, ax = plt.subplots(figsize=(10, 6.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 8.5)
    ax.axis('off')
    
    lifelines = [
        ("Speaker", 0.8),
        ("LiveStudio UI", 2.2),
        ("FastAPI Backend", 4.0),
        ("Faster-Whisper / Diarizer", 6.0),
        ("Phi-3.5 / DistilBERT", 7.8),
        ("DCA v2 & Neo4j", 9.2)
    ]
    
    for name, x in lifelines:
        b = FancyBboxPatch((x-0.65, 7.8), 1.3, 0.5, boxstyle="round,pad=0.05", facecolor="#E2E8F0", edgecolor="#475569", lw=1.2)
        ax.add_patch(b)
        ax.text(x, 8.05, name, ha='center', va='center', fontweight='bold', fontsize=7.5)
        ax.plot([x, x], [0.8, 7.8], color="#94A3B8", linestyle="--", lw=1.2)
        
    steps = [
        ("1. Speaks: 'We must require video feeds...'", 0.8, 2.2, 7.3, "#1F2937"),
        ("2. POST /live/transcribe-audio (WebM chunk)", 2.2, 4.0, 6.6, "#2563EB"),
        ("3. INT8 ASR + F0 Pitch Diarization", 4.0, 6.0, 5.9, "#2563EB"),
        ("4. Utterance turns (Speaker 1, 145 Hz)", 6.0, 4.0, 5.2, "#059669"),
        ("5. DistilBERT clf (p=0.88) + Phi-3.5 Extract", 4.0, 7.8, 4.5, "#2563EB"),
        ("6. Decision Tuple + BGE 1024-d Embedding", 7.8, 4.0, 3.8, "#059669"),
        ("7. Scoped Candidate Query + Cosine Gate (0.78)", 4.0, 9.2, 3.1, "#D97706"),
        ("8. Stance Score = -0.77 (CONTRADICTS)", 9.2, 4.0, 2.4, "#DC2626"),
        ("9. Emit Conflict: [DO NOT APPROVE]", 4.0, 2.2, 1.7, "#DC2626"),
        ("10. Renders Conflict Card & Conflicting Quotes", 2.2, 0.8, 1.0, "#DC2626")
    ]
    
    for text, x1, x2, y, col in steps:
        ax.annotate(text, xy=(x2, y), xytext=(x1, y),
                    arrowprops=dict(arrowstyle="->", lw=1.3, color=col),
                    fontsize=7.5, fontweight='bold', color=col, va='bottom')

    ax.set_title("Figure 4.7: Sequence Diagram for Live Audio Ingestion and Contradiction Verification", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_4_7_sequence_diagram.png"))
    plt.close()
    print("Generated Fig 4.7")

# -------------------------------------------------------------
# Figure 5.1: Diarization / Pitch Autocorrelation
# -------------------------------------------------------------
def generate_fig_5_1():
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(9, 5), dpi=300)
    
    # Waveform & Autocorrelation
    t = np.linspace(0, 0.05, 500)
    # Synthetic pitch wave ~ 150 Hz
    signal = np.sin(2 * np.pi * 150 * t) + 0.4 * np.sin(2 * np.pi * 300 * t)
    ax1.plot(t * 1000, signal, color="#2563EB", lw=1.5)
    ax1.set_title("Acoustic Speech Frame (Window w = 1024 samples)", fontweight='bold', fontsize=9.5)
    ax1.set_xlabel("Time (milliseconds)", fontsize=8)
    ax1.set_ylabel("Normalized Amplitude", fontsize=8)
    ax1.grid(True, linestyle=":", alpha=0.6)
    
    # Autocorrelation curve with peak lag
    lags = np.linspace(20, 250, 400) # samples
    # peak at sample lag ~ 106 (16000 / 150Hz = 106.6)
    autocorr = np.exp(-((lags - 106.6)**2) / 80) * 0.85 + 0.1 * np.cos(lags / 10)
    ax2.plot(lags, autocorr, color="#059669", lw=1.8)
    ax2.axvline(106.6, color="#DC2626", linestyle="--", lw=1.5, label="Peak Lag tau* = 106.6 -> F0 = 150.1 Hz (Tenor)")
    ax2.set_title("Short-Time Autocorrelation R(tau) & Fundamental Pitch Peak (F0)", fontweight='bold', fontsize=9.5)
    ax2.set_xlabel("Lag tau (samples at 16 kHz)", fontsize=8)
    ax2.set_ylabel("Autocorrelation Magnitude", fontsize=8)
    ax2.legend(loc="upper right", fontsize=8.5)
    ax2.grid(True, linestyle=":", alpha=0.6)
    
    plt.suptitle("Figure 5.1: Audio Acoustic Diarization via Autocorrelation Pitch (F0) & Spectral Centroid", fontweight='bold', fontsize=11, y=0.99)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_5_1_diarization.png"))
    plt.close()
    print("Generated Fig 5.1")

# -------------------------------------------------------------
# Figure 5.2: Decision Extraction via Phi-3.5
# -------------------------------------------------------------
def generate_fig_5_2():
    fig, ax = plt.subplots(figsize=(9.5, 4.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5)
    ax.axis('off')
    
    # Context window box
    b1 = FancyBboxPatch((0.5, 1.0), 3.2, 3.2, boxstyle="round,pad=0.1", facecolor="#F1F5F9", edgecolor="#64748B", lw=1.5)
    ax.add_patch(b1)
    ax.text(2.1, 3.9, "Conversational Context Window", ha='center', fontweight='bold', fontsize=8.5, color="#1E293B")
    ax.text(0.7, 3.3, "u_{i-1}: 'Should we keep 20 min slots?'", fontsize=7.5, color="#475569")
    ax.text(0.7, 2.5, "u_i (Target): 'Yes, standard GP\nconsultations must maintain\na 20-minute slot.'", fontsize=7.5, fontweight='bold', color="#0F172A")
    ax.text(0.7, 1.5, "u_{i+1}: 'Agreed, noted in minutes.'", fontsize=7.5, color="#475569")
    
    # SLM Box
    b2 = FancyBboxPatch((4.2, 1.8), 2.2, 1.6, boxstyle="round,pad=0.1", facecolor="#FEF3C7", edgecolor="#D97706", lw=2)
    ax.add_patch(b2)
    ax.text(5.3, 2.8, "Microsoft Phi-3.5 3.8B\n(Quantized 4-bit / INT8)", ha='center', fontweight='bold', fontsize=8, color="#92400E")
    ax.text(5.3, 2.1, "Local Ollama Engine\nT = 0.10, L = 300", ha='center', fontsize=7.5, color="#78350F")
    
    # JSON Output box
    b3 = FancyBboxPatch((6.8, 0.8), 2.8, 3.5, boxstyle="round,pad=0.1", facecolor="#EFF6FF", edgecolor="#2563EB", lw=1.5)
    ax.add_patch(b3)
    ax.text(8.2, 4.0, "Validated Pydantic JSON Tuple", ha='center', fontweight='bold', fontsize=8.5, color="#1E3A8A")
    json_text = '{\n  "decision_text": "Standard\n    consultation times must\n    maintain min 20 min.",\n  "justification": "Ensures\n    clinical compliance.",\n  "speaker": "Speaker 1",\n  "references_prior": false\n}'
    ax.text(7.0, 2.4, json_text, fontsize=7, fontfamily="monospace", color="#1E40AF")
    
    # Arrows
    ax.annotate("", xy=(4.2, 2.6), xytext=(3.7, 2.6), arrowprops=dict(arrowstyle="->", lw=1.8, color="#1F2937"))
    ax.annotate("", xy=(6.8, 2.6), xytext=(6.4, 2.6), arrowprops=dict(arrowstyle="->", lw=1.8, color="#1F2937"))
    
    ax.set_title("Figure 5.2: Decision Extraction and JSON Schema Validation using Phi-3.5 3.8B", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_5_2_extraction.png"))
    plt.close()
    print("Generated Fig 5.2")

# -------------------------------------------------------------
# Figure 5.3: Neo4j Knowledge Graph Metamodel
# -------------------------------------------------------------
def generate_fig_5_3():
    fig, ax = plt.subplots(figsize=(9, 5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis('off')
    
    nodes = [
        ("(:Organization)", 1.5, 4.5, "#E0E7FF", "#4338CA"),
        ("(:Meeting)", 4.5, 4.5, "#DBEAFE", "#2563EB"),
        ("(:Topic)", 8.0, 4.5, "#FEF3C7", "#D97706"),
        ("(:Decision)", 4.5, 2.0, "#D1FAE5", "#059669"),
        ("(:PolicyDocument)", 8.0, 2.0, "#FCE7F3", "#BE185D"),
        ("(:Stakeholder)", 1.5, 2.0, "#F3E8FF", "#7E22CE")
    ]
    
    for text, x, y, col, border in nodes:
        b = FancyBboxPatch((x-1.0, y-0.4), 2.0, 0.8, boxstyle="round,pad=0.15", facecolor=col, edgecolor=border, lw=2)
        ax.add_patch(b)
        ax.text(x, y, text, ha='center', va='center', fontweight='bold', fontsize=8.5, color=border)
        
    # Edges
    edges = [
        ("[:PART_OF]", 4.5, 4.5, 1.5, 4.5),
        ("[:RELATES_TO]", 4.5, 2.0, 8.0, 4.5),
        ("[:MADE_IN]", 4.5, 2.0, 4.5, 4.5),
        ("[:OWNED_BY]", 4.5, 2.0, 1.5, 2.0),
        ("[:GROUNDED_IN]", 4.5, 2.0, 8.0, 2.0),
    ]
    
    for label, x1, y1, x2, y2 in edges:
        ax.annotate(label, xy=(x2, y2), xytext=(x1, y1),
                    arrowprops=dict(arrowstyle="->", lw=1.5, color="#475569"),
                    fontsize=7.5, fontweight='bold', color="#334155", ha='center', va='bottom')
        
    # Self/Reflexive edge on Decision for Contradicts / Supersedes
    ax.annotate("[:CONTRADICTS {score}]\n[:SUPERSEDES]", xy=(5.2, 1.6), xytext=(3.8, 1.6),
                arrowprops=dict(arrowstyle="<->", lw=1.8, color="#DC2626"),
                fontsize=7.5, fontweight='bold', color="#DC2626", ha='center', va='top')

    ax.set_title("Figure 5.3: Neo4j Dynamic Knowledge Graph Metamodel Schema", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_5_3_graph_schema.png"))
    plt.close()
    print("Generated Fig 5.3")

# -------------------------------------------------------------
# Figure 5.4: DCA v2 Pipeline Workflow
# -------------------------------------------------------------
def generate_fig_5_4():
    fig, ax = plt.subplots(figsize=(10, 4.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5)
    ax.axis('off')
    
    stages = [
        ("STAGE 1\nScoped Candidate\nRetrieval", 1.2, "#DBEAFE", "#1E40AF"),
        ("STAGE 2\nTopic & Cosine Gate\n(sim >= 0.65)", 3.8, "#FEF3C7", "#B45309"),
        ("STAGE 3\nDual-Stance NLI\n(BART-MNLI)", 6.4, "#FEE2E2", "#B91C1C"),
        ("STAGE 4\nRecency Decay &\nEdge Commitment", 9.0, "#D1FAE5", "#047857")
    ]
    
    for title, x, bg, border in stages:
        b = FancyBboxPatch((x-1.0, 1.5), 2.0, 2.0, boxstyle="round,pad=0.15", facecolor=bg, edgecolor=border, lw=2)
        ax.add_patch(b)
        ax.text(x, 2.5, title, ha='center', va='center', fontweight='bold', fontsize=8.5, color=border)
        
    for i in range(len(stages)-1):
        x1 = stages[i][1] + 1.0
        x2 = stages[i+1][1] - 1.0
        ax.annotate("", xy=(x2, 2.5), xytext=(x1, 2.5), arrowprops=dict(arrowstyle="->", lw=2, color="#374151"))
        
    ax.text(2.5, 2.8, "Top-K\nActive", ha='center', fontsize=7.5, fontweight='bold')
    ax.text(5.1, 2.8, "Subject\nAligned", ha='center', fontsize=7.5, fontweight='bold')
    ax.text(7.7, 2.8, "Stance\nScore", ha='center', fontsize=7.5, fontweight='bold')

    ax.set_title("Figure 5.4: Decision Consistency Algorithm v2 (DCA v2) Pipeline Workflow", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_5_4_dca_pipeline.png"))
    plt.close()
    print("Generated Fig 5.4")

# -------------------------------------------------------------
# Figure 5.5: Multi-Tenancy Scoping Diagram
# -------------------------------------------------------------
def generate_fig_5_5():
    fig, ax = plt.subplots(figsize=(9, 4.5), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5)
    ax.axis('off')
    
    # Org A box
    box_a = FancyBboxPatch((0.5, 0.8), 4.2, 3.4, boxstyle="round,pad=0.2", facecolor="#EFF6FF", edgecolor="#3B82F6", lw=2)
    ax.add_patch(box_a)
    ax.text(2.6, 3.8, "Tenant Workspace: eval_org5\n(Healthcare & Clinical SOPs)", ha='center', fontweight='bold', fontsize=8.5, color="#1E40AF")
    
    # Org B box
    box_b = FancyBboxPatch((5.3, 0.8), 4.2, 3.4, boxstyle="round,pad=0.2", facecolor="#F0FDF4", edgecolor="#10B981", lw=2)
    ax.add_patch(box_b)
    ax.text(7.4, 3.8, "Tenant Workspace: eval_org6\n(Supply Chain Logistics)", ha='center', fontweight='bold', fontsize=8.5, color="#065F46")
    
    # Content inside A
    ax.text(2.6, 2.8, "• Decisions: Telehealth video slots\n• Documents: Clinical Practice SOP\n• Subgraphs: Pediatric, Cardiology", fontsize=7.5, ha='center', color="#1E3A8A")
    ax.text(2.6, 1.4, "Strict WHERE d.org_id = 'eval_org5'\nCypher Parameter Enforcement", fontsize=7.5, ha='center', fontweight='bold', color="#2563EB")
    
    # Content inside B
    ax.text(7.4, 2.8, "• Decisions: Grain freight quotas\n• Documents: Export Customs By-law\n• Subgraphs: Maritime, Rail", fontsize=7.5, ha='center', color="#064E3B")
    ax.text(7.4, 1.4, "Strict WHERE d.org_id = 'eval_org6'\nCypher Parameter Enforcement", fontsize=7.5, ha='center', fontweight='bold', color="#059669")
    
    # Boundary wall in between
    ax.plot([4.85, 4.85], [0.6, 4.4], color="#DC2626", linestyle="--", lw=2)
    ax.text(4.85, 2.5, "NO CROSS-TENANT DATA LEAKAGE\n(Zero Token / Graph Sharing)", ha='center', va='center', rotation=90, color="#DC2626", fontweight='bold', fontsize=7.5)

    ax.set_title("Figure 5.5: Multi-Tenancy Data Scoping and Cypher Graph Partitioning", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_5_5_multitenancy.png"))
    plt.close()
    print("Generated Fig 5.5")

# -------------------------------------------------------------
# Figure 6.1 to 6.7: UI Mockup Visual Diagrams
# -------------------------------------------------------------
def generate_ui_mockups():
    # 6.1 Auth UI
    fig, ax = plt.subplots(figsize=(8.5, 4.8), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis('off')
    
    frame = FancyBboxPatch((1.5, 0.8), 7.0, 4.6, boxstyle="round,pad=0.2", facecolor="#1E293B", edgecolor="#38BDF8", lw=2)
    ax.add_patch(frame)
    ax.text(5.0, 4.8, "MULTIMODAL MEETING-TO-DECISION AUDITOR", ha='center', fontweight='bold', color="white", fontsize=11)
    ax.text(5.0, 4.4, "Sovereign Enterprise Knowledge & Integrity Platform", ha='center', color="#94A3B8", fontsize=8.5)
    
    # Org select box
    card = FancyBboxPatch((2.2, 1.3), 5.6, 2.7, boxstyle="round,pad=0.1", facecolor="#0F172A", edgecolor="#475569")
    ax.add_patch(card)
    ax.text(5.0, 3.6, "Select Tenant Organization Workspace", ha='center', color="#38BDF8", fontweight='bold', fontsize=9.5)
    
    orgs = ["HealthTech Clinical Council (eval_org5)", "FinTech Operations Group", "VIT Capstone Engineering", "+ Register New Workspace"]
    for i, org in enumerate(orgs):
        btn = FancyBboxPatch((2.6, 2.9 - i*0.5), 4.8, 0.38, boxstyle="round,pad=0.05",
                             facecolor="#1E3A8A" if i==0 else "#1E293B", edgecolor="#3B82F6" if i==0 else "#64748B")
        ax.add_patch(btn)
        ax.text(5.0, 3.09 - i*0.5, org, ha='center', color="white", fontsize=8, fontweight='bold' if i==0 else 'normal')
        
    ax.set_title("Figure 6.1: Authentication Page with Tenant Organization Selection", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_6_1_auth_ui.png"))
    plt.close()
    print("Generated Fig 6.1")

    # 6.2 Executive Dashboard UI
    fig, ax = plt.subplots(figsize=(9.5, 5.2), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis('off')
    
    frame = FancyBboxPatch((0.5, 0.5), 9.0, 5.0, boxstyle="round,pad=0.15", facecolor="#0F172A", edgecolor="#334155", lw=1.5)
    ax.add_patch(frame)
    ax.text(1.0, 5.1, "Executive Decision Integrity Dashboard", fontweight='bold', color="white", fontsize=11)
    ax.text(8.8, 5.1, "Org: HealthTech [ONLINE]", ha='right', color="#10B981", fontweight='bold', fontsize=8.5)
    
    cards = [
        ("Total Ratified Decisions", "42 Active", "#1E3A8A", "#3B82F6", 0.8),
        ("Total Meetings Audited", "14 Sessions", "#065F46", "#10B981", 3.0),
        ("Active Contradiction Alerts", "2 Conflicts", "#7F1D1D", "#EF4444", 5.2),
        ("Service Health Status", "All 3 Engines OK", "#581C87", "#A855F7", 7.4)
    ]
    for title, val, bg, border, x in cards:
        b = FancyBboxPatch((x, 3.4), 1.9, 1.2, boxstyle="round,pad=0.1", facecolor=bg, edgecolor=border, lw=1.5)
        ax.add_patch(b)
        ax.text(x+0.95, 4.2, title, ha='center', color="#E2E8F0", fontsize=7, fontweight='bold')
        ax.text(x+0.95, 3.7, val, ha='center', color="white", fontsize=10, fontweight='bold')
        
    feed = FancyBboxPatch((0.8, 0.8), 8.4, 2.2, boxstyle="round,pad=0.1", facecolor="#1E293B", edgecolor="#475569")
    ax.add_patch(feed)
    ax.text(1.1, 2.6, "Recent Meeting Audit Activity Stream", color="#38BDF8", fontweight='bold', fontsize=8.5)
    ax.text(1.1, 2.1, "• Meeting 003 (Clinical Sync): Ratified standard video consultation slot (Speaker 1) - DCA v2 OK", color="#F8FAFC", fontsize=7.5)
    ax.text(1.1, 1.6, "• Meeting 002 (Staff Review): Proposed audio-only consultations - CONTRADICTS Meeting 001 Rule", color="#FCA5A5", fontsize=7.5, fontweight='bold')
    ax.text(1.1, 1.1, "• Meeting 001 (Policy Ratification): Established baseline patient protocol - Active", color="#94A3B8", fontsize=7.5)

    ax.set_title("Figure 6.2: Executive Health & Analytics Dashboard Interface", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_6_2_dashboard_ui.png"))
    plt.close()
    print("Generated Fig 6.2")

    # 6.3 Upload UI
    fig, ax = plt.subplots(figsize=(9, 4.8), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.5)
    ax.axis('off')
    
    frame = FancyBboxPatch((0.5, 0.5), 9.0, 4.6, boxstyle="round,pad=0.15", facecolor="#F8FAFC", edgecolor="#CBD5E1", lw=1.5)
    ax.add_patch(frame)
    ax.text(1.0, 4.7, "Multi-Modal Meeting & Policy Document Ingestion", fontweight='bold', color="#0F172A", fontsize=11)
    
    drop_audio = FancyBboxPatch((0.9, 1.2), 3.8, 3.0, boxstyle="round,pad=0.1", facecolor="#EFF6FF", edgecolor="#3B82F6", lw=1.5, linestyle="--")
    ax.add_patch(drop_audio)
    ax.text(2.8, 3.4, "DRAG & DROP MEETING AUDIO / VIDEO", ha='center', color="#1D4ED8", fontweight='bold', fontsize=8)
    ax.text(2.8, 2.7, "Supports WAV, MP3, MP4, WebM\nAuto INT8 Faster-Whisper ASR\n& Pitch Diarization Pipeline", ha='center', color="#475569", fontsize=7.5)
    
    drop_doc = FancyBboxPatch((5.3, 1.2), 3.8, 3.0, boxstyle="round,pad=0.1", facecolor="#F0FDF4", edgecolor="#10B981", lw=1.5)
    ax.add_patch(drop_doc)
    ax.text(7.2, 3.6, "AI-VERIFIED POLICY DOCUMENT PROOF CARD", ha='center', color="#047857", fontweight='bold', fontsize=8)
    ax.text(7.2, 3.0, "Verified Document: Clinical_SOP_2026.pdf\nStatus: [VERIFIED SOVEREIGN CHARTER]\nClause 4.2: 'All patient intake sessions\nmust maintain minimum 20 min records.'", ha='center', color="#1F2937", fontsize=7.5)
    ax.text(7.2, 1.6, "[✓ GROUNDED IN KNOWLEDGE GRAPH]", ha='center', color="#059669", fontweight='bold', fontsize=7.5)

    ax.set_title("Figure 6.3: Multi-Modal Meeting Upload Interface with Supporting Document Proof Card", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_6_3_upload_ui.png"))
    plt.close()
    print("Generated Fig 6.3")

    # 6.4 Live Studio UI
    fig, ax = plt.subplots(figsize=(9.5, 5.2), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis('off')
    
    frame = FancyBboxPatch((0.5, 0.5), 9.0, 5.0, boxstyle="round,pad=0.15", facecolor="#0B132B", edgecolor="#1C2541", lw=1.5)
    ax.add_patch(frame)
    ax.text(1.0, 5.1, "Live Listening Studio — Real-Time Diarization & Stance Auditing", fontweight='bold', color="white", fontsize=10.5)
    
    # Spectrum analyzer bar simulation
    for i in range(25):
        h = np.random.uniform(0.3, 1.2)
        ax.add_patch(Rectangle((0.9 + i*0.15, 3.5), 0.1, h, facecolor="#38BDF8"))
    ax.text(2.8, 3.2, "Real-Time Microphone Frequency Spectrum (WebRTC 16 kHz)", ha='center', color="#94A3B8", fontsize=7)
    
    # Diarization Roster Card
    roster = FancyBboxPatch((5.2, 2.8), 4.0, 2.0, boxstyle="round,pad=0.1", facecolor="#1C2541", edgecolor="#3A506B")
    ax.add_patch(roster)
    ax.text(7.2, 4.4, "Real-Time Acoustic Diarization Roster", ha='center', color="#38BDF8", fontweight='bold', fontsize=8)
    ax.text(7.2, 3.8, "• Speaker 1: F0 = 145.2 Hz [Tenor / Male] (Active)", color="#10B981", fontweight='bold', fontsize=7.5, ha='center')
    ax.text(7.2, 3.2, "• Speaker 2: F0 = 212.8 Hz [Alto / Female] (Silent)", color="#94A3B8", fontsize=7.5, ha='center')
    
    # Real-time transcript box
    trans_box = FancyBboxPatch((0.9, 0.8), 8.3, 1.7, boxstyle="round,pad=0.1", facecolor="#1F2937", edgecolor="#475569")
    ax.add_patch(trans_box)
    ax.text(1.2, 2.1, "Interim Speech Transcription Preview (Web Speech + INT8 Faster-Whisper):", color="#38BDF8", fontweight='bold', fontsize=8)
    ax.text(1.2, 1.4, "\"We agreed in this morning's session that video feeds are no longer mandatory and audio-only is acceptable.\"", color="#FCA5A5", fontsize=8, fontstyle="italic")

    ax.set_title("Figure 6.4: Live Listening Studio with Real-Time Acoustic Diarization Roster and Frequencies", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_6_4_live_studio_ui.png"))
    plt.close()
    print("Generated Fig 6.4")

    # 6.5 Real-Time Contradiction Verdict Card
    fig, ax = plt.subplots(figsize=(9, 4.8), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.5)
    ax.axis('off')
    
    v_box = FancyBboxPatch((0.8, 0.8), 8.4, 4.2, boxstyle="round,pad=0.15", facecolor="#450A0A", edgecolor="#EF4444", lw=2.5)
    ax.add_patch(v_box)
    ax.text(5.0, 4.4, "[ ❌ NO — DO NOT APPROVE THIS DECISION ]", ha='center', fontweight='bold', color="#FCA5A5", fontsize=12)
    ax.text(5.0, 3.9, "CRITICAL POLICY CONTRADICTION DETECTED BY DCA v2 (Stance Score: -0.774)", ha='center', color="white", fontweight='bold', fontsize=8.5)
    
    # Comparison columns
    c1 = FancyBboxPatch((1.2, 1.2), 3.6, 2.3, boxstyle="round,pad=0.1", facecolor="#1F2937", edgecolor="#7F1D1D")
    ax.add_patch(c1)
    ax.text(3.0, 3.1, "Newly Spoken Statement (Current):", color="#FCA5A5", fontweight='bold', fontsize=7.5, ha='center')
    ax.text(3.0, 2.2, "\"Mandatory video feeds are\nwaived; all telehealth sessions\nmay proceed audio-only.\"", color="white", fontsize=7.5, ha='center')
    ax.text(3.0, 1.4, "Speaker: Speaker 1 | Time: 11:34 AM", color="#94A3B8", fontsize=7, ha='center')
    
    c2 = FancyBboxPatch((5.2, 1.2), 3.6, 2.3, boxstyle="round,pad=0.1", facecolor="#1F2937", edgecolor="#7F1D1D")
    ax.add_patch(c2)
    ax.text(7.0, 3.1, "Prior Ratified Policy (Meeting 001):", color="#38BDF8", fontweight='bold', fontsize=7.5, ha='center')
    ax.text(7.0, 2.2, "\"Mandatory two-way video feeds\nare strictly required for all\noutpatient telehealth intake.\"", color="white", fontsize=7.5, ha='center')
    ax.text(7.0, 1.4, "Ratified: 14 Jan 2026 | ID: dec_01", color="#94A3B8", fontsize=7, ha='center')

    ax.set_title("Figure 6.5: Real-Time Contradiction Verdict Card with Prior Conflicting Meeting Quotes", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_6_5_contradiction_verdict_ui.png"))
    plt.close()
    print("Generated Fig 6.5")

    # 6.6 Cytoscape Graph UI
    fig, ax = plt.subplots(figsize=(9.5, 5.2), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 6)
    ax.axis('off')
    
    g_frame = FancyBboxPatch((0.5, 0.5), 9.0, 5.0, boxstyle="round,pad=0.15", facecolor="#0F172A", edgecolor="#334155", lw=1.5)
    ax.add_patch(g_frame)
    ax.text(1.0, 5.1, "Cytoscape.js Force-Directed Dynamic Knowledge Graph Explorer", fontweight='bold', color="white", fontsize=10.5)
    ax.text(8.8, 5.1, "Topic Filter: [All Topics]", ha='right', color="#38BDF8", fontsize=8)
    
    # Draw graph nodes
    c_org = Circle((5.0, 3.0), 0.6, facecolor="#4338CA", edgecolor="#6366F1", lw=2)
    ax.add_patch(c_org)
    ax.text(5.0, 3.0, "HealthTech\nOrg", ha='center', va='center', color='white', fontweight='bold', fontsize=7.5)
    
    m1 = Rectangle((2.5, 3.8), 1.2, 0.6, facecolor="#2563EB", edgecolor="#60A5FA")
    ax.add_patch(m1)
    ax.text(3.1, 4.1, "Mtg 001", ha='center', va='center', color='white', fontweight='bold', fontsize=7)
    
    m2 = Rectangle((6.5, 3.8), 1.2, 0.6, facecolor="#2563EB", edgecolor="#60A5FA")
    ax.add_patch(m2)
    ax.text(7.1, 4.1, "Mtg 002", ha='center', va='center', color='white', fontweight='bold', fontsize=7)
    
    d1 = Circle((2.5, 2.0), 0.45, facecolor="#059669", edgecolor="#34D399", lw=2)
    ax.add_patch(d1)
    ax.text(2.5, 2.0, "Dec 01\n(Active)", ha='center', va='center', color='white', fontweight='bold', fontsize=6.5)
    
    d2 = Circle((7.1, 2.0), 0.45, facecolor="#DC2626", edgecolor="#F87171", lw=2)
    ax.add_patch(d2)
    ax.text(7.1, 2.0, "Dec 02\n(Conflict)", ha='center', va='center', color='white', fontweight='bold', fontsize=6.5)
    
    # Edges
    ax.plot([4.4, 3.1], [3.2, 3.8], color="#64748B", lw=1.5)
    ax.plot([5.6, 6.5], [3.2, 3.8], color="#64748B", lw=1.5)
    ax.plot([3.1, 2.5], [3.8, 2.45], color="#64748B", lw=1.5)
    ax.plot([7.1, 7.1], [3.8, 2.45], color="#64748B", lw=1.5)
    
    # Conflict edge between D1 and D2
    ax.annotate("[:CONTRADICTS {score: -0.77}]", xy=(6.6, 2.0), xytext=(3.0, 2.0),
                arrowprops=dict(arrowstyle="<->", lw=2, color="#EF4444", linestyle="--"),
                fontsize=7.5, fontweight='bold', color="#EF4444", ha='center', va='bottom')

    ax.set_title("Figure 6.6: Interactive Neo4j Knowledge Graph Visualization with Cytoscape.js", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_6_6_cytoscape_graph_ui.png"))
    plt.close()
    print("Generated Fig 6.6")

    # 6.7 Alert Resolution Drawer UI
    fig, ax = plt.subplots(figsize=(9, 4.8), dpi=300)
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 5.5)
    ax.axis('off')
    
    drw = FancyBboxPatch((1.0, 0.5), 8.0, 4.6, boxstyle="round,pad=0.15", facecolor="#1E293B", edgecolor="#475569", lw=2)
    ax.add_patch(drw)
    ax.text(5.0, 4.6, "Contradiction & Supersession Alert Resolution Drawer", ha='center', fontweight='bold', color="white", fontsize=10.5)
    
    box_audit = FancyBboxPatch((1.4, 1.8), 7.2, 2.5, boxstyle="round,pad=0.1", facecolor="#0F172A", edgecolor="#334155")
    ax.add_patch(box_audit)
    ax.text(1.7, 3.9, "Contradiction Alert #CA-2026-08 | High Severity Conflict", color="#F87171", fontweight='bold', fontsize=8.5)
    ax.text(1.7, 3.3, "Proposed: 'Waive video requirement for telehealth' (Meeting 002)\nContradicts: 'Mandatory two-way video required' (Meeting 001)\nVerified Supporting Proof: Clinical_Charter_2026.pdf (Clause 4.2 Attached)", color="#E2E8F0", fontsize=7.5)
    
    # Resolution Buttons
    btn_reject = FancyBboxPatch((1.8, 0.8), 3.0, 0.7, boxstyle="round,pad=0.1", facecolor="#B91C1C", edgecolor="#EF4444")
    ax.add_patch(btn_reject)
    ax.text(3.3, 1.15, "Reject Proposed Decision\n(Preserve Standing Rule)", ha='center', va='center', color='white', fontweight='bold', fontsize=7.5)
    
    btn_super = FancyBboxPatch((5.2, 0.8), 3.0, 0.7, boxstyle="round,pad=0.1", facecolor="#047857", edgecolor="#10B981")
    ax.add_patch(btn_super)
    ax.text(6.7, 1.15, "Approve & Supersede\n(Update Graph Edge)", ha='center', va='center', color='white', fontweight='bold', fontsize=7.5)

    ax.set_title("Figure 6.7: Contradiction & Supersession Alert Resolution Drawer with Verified Document Proof", fontweight='bold', fontsize=11, pad=10)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_6_7_resolution_drawer_ui.png"))
    plt.close()
    print("Generated Fig 6.7")

# -------------------------------------------------------------
# Figure 7.1: Precision-Recall Comparison
# -------------------------------------------------------------
def generate_fig_7_1():
    fig, ax = plt.subplots(figsize=(9, 4.8), dpi=300)
    
    categories = ['Strict Precision', 'Strict Recall', 'Strict F1 Score', 'Label-Only Precision', 'Label-Only F1']
    dca_v1 = [0.14, 0.22, 0.17, 0.50, 0.61]
    dca_v2_oracle = [0.60, 0.33, 0.43, 0.80, 0.57]
    dca_v2_e2e = [0.33, 0.11, 0.17, 0.33, 0.17]
    
    x = np.arange(len(categories))
    width = 0.25
    
    r1 = ax.bar(x - width, dca_v1, width, label='Baseline DCA v1 (Oracle)', color='#94A3B8', edgecolor='#475569')
    r2 = ax.bar(x, dca_v2_oracle, width, label='Proposed DCA v2 (Oracle)', color='#2563EB', edgecolor='#1E40AF')
    r3 = ax.bar(x + width, dca_v2_e2e, width, label='Proposed DCA v2 (End-to-End)', color='#059669', edgecolor='#065F46')
    
    ax.set_ylabel('Score (0.0 to 1.0)', fontweight='bold')
    ax.set_title('Figure 7.1: Precision-Recall Comparison across Pipeline Configurations', fontweight='bold', fontsize=11, pad=12)
    ax.set_xticks(x)
    ax.set_xticklabels(categories, fontweight='bold', fontsize=8.5)
    ax.legend(loc='upper right', fontsize=8.5)
    ax.grid(axis='y', linestyle=':', alpha=0.7)
    ax.set_ylim(0, 1.0)
    
    # Annotate key improvement
    ax.annotate('4.3x Precision\nIncrease (0.14 -> 0.60)', xy=(0, 0.60), xytext=(0.2, 0.75),
                arrowprops=dict(arrowstyle='->', lw=1.5, color='#DC2626'),
                fontweight='bold', color='#DC2626', fontsize=8)

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_7_1_precision_recall.png"))
    plt.close()
    print("Generated Fig 7.1")

# -------------------------------------------------------------
# Figure 7.2: Confusion Matrix Heatmap
# -------------------------------------------------------------
def generate_fig_7_2():
    fig, ax = plt.subplots(figsize=(6.5, 5.2), dpi=300)
    
    # 2x2 matrix: Actual vs Predicted
    # Actual Positive (Contradiction): TP=3, FN=6
    # Actual Negative (Non-contradiction): FP=2, TN=23
    matrix = np.array([[3, 6], [2, 23]])
    
    cax = ax.matshow(matrix, cmap='Blues', alpha=0.85)
    fig.colorbar(cax, ax=ax, fraction=0.046, pad=0.04)
    
    labels = [['True Positive\n(TP = 3)', 'False Negative\n(FN = 6)'],
              ['False Positive\n(FP = 2)', 'True Negative\n(TN = 23)']]
              
    for i in range(2):
        for j in range(2):
            color = 'white' if matrix[i, j] > 10 else 'black'
            ax.text(j, i, labels[i][j], ha='center', va='center', fontweight='bold', fontsize=10, color=color)
            
    ax.set_xticks([0, 1])
    ax.set_yticks([0, 1])
    ax.set_xticklabels(['Pred: Contradiction', 'Pred: Non-Conflict'], fontweight='bold', fontsize=9.5)
    ax.set_yticklabels(['Actual: Contradiction', 'Actual: Non-Conflict'], fontweight='bold', fontsize=9.5)
    
    ax.set_title('Figure 7.2: Contradiction Detection Confusion Matrix on Held-Out Test Corpus (n=34)', fontweight='bold', fontsize=10.5, pad=15)
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_7_2_confusion_matrix.png"))
    plt.close()
    print("Generated Fig 7.2")

# -------------------------------------------------------------
# Figure 7.3: Operating Cost Comparison
# -------------------------------------------------------------
def generate_fig_7_3():
    fig, ax = plt.subplots(figsize=(8.5, 4.8), dpi=300)
    
    models = ['Commercial Cloud APIs\n(OpenAI/Anthropic SaaS)', 'Local Sovereign Stack\n(Decision Auditor Ours)']
    costs = [1305.00, 20.00]
    colors = ['#DC2626', '#059669']
    
    bars = ax.bar(models, costs, color=colors, width=0.45, edgecolor='#1F2937', lw=1.5)
    
    for bar, cost in zip(bars, costs):
        yval = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2, yval + 30, f"${cost:,.2f} / month\n(${cost*12:,.2f} / yr)",
                ha='center', va='bottom', fontweight='bold', fontsize=9.5)
        
    ax.set_ylabel('Monthly Operating Cost (USD $)', fontweight='bold')
    ax.set_title('Figure 7.3: Monthly Operating Cost Comparison: Local Sovereign Stack vs. Cloud LLM APIs', fontweight='bold', fontsize=10.5, pad=12)
    ax.set_ylim(0, 1600)
    ax.grid(axis='y', linestyle=':', alpha=0.7)
    
    ax.annotate('98.4% Operating Cost Reduction\n($15,420 Annual Savings)', xy=(1, 20), xytext=(0.6, 600),
                arrowprops=dict(arrowstyle='->', lw=2, color='#059669'),
                fontweight='bold', color='#059669', fontsize=9.5)

    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, "fig_7_3_cost_comparison.png"))
    plt.close()
    print("Generated Fig 7.3")

if __name__ == "__main__":
    generate_fig_2_1()
    generate_fig_4_1()
    generate_fig_4_2()
    generate_fig_4_3()
    generate_fig_4_4()
    generate_fig_4_5()
    generate_fig_4_6()
    generate_fig_4_7()
    generate_fig_5_1()
    generate_fig_5_2()
    generate_fig_5_3()
    generate_fig_5_4()
    generate_fig_5_5()
    generate_ui_mockups()
    generate_fig_7_1()
    generate_fig_7_2()
    generate_fig_7_3()
    print("ALL 21 FIGURES SUCCESSFULLY GENERATED!")

#!/bin/bash -e
# =============================================================================
# load_16076_network.sh
#
# Extracts zip files from Downloads and loads ALL artifacts for study 16076
# into the LOCAL Qiita postgres database (localhost only).
#
# Reconstructed processing DAG:
#   221886 (per_sample_FASTQ)  ← root, linked to prep template
#     ├── 221891 (all.biom)              [Deblur/DADA2 run 1]
#     │     └── 221892 (reference-hit.biom)
#     │           └── 221895 (feature-table.biom)
#     ├── 221893 (all.biom)              [Deblur/DADA2 run 2]
#     │     └── 221894 (reference-hit.biom)
#     │           └── 221896 (feature-table.biom)
#     ├── 221897 (otu_table.biom + log)  [SortMeRNA run 1]
#     │     └── 221898 (reference-hit.biom)
#     ├── 221899 (all.biom)              [Deblur/DADA2 run 3]
#     ├── 221900 (otu_table.biom + log)  [SortMeRNA run 2]
#     │     └── 221902 (feature-table.biom)
#     └── 221901 (otu_table.biom + log)  [SortMeRNA run 3]
#
# Prerequisites:
#   - study 16076 must already be loaded (run load_studies_safe.sh first)
#   - Run from the qiita-web project root: bash load_16076_network.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STUDY_DIR="$SCRIPT_DIR/test_data_studies/studies/16076"
DATA_DIR="$STUDY_DIR/raw_data"
DOWNLOADS_DIR="$HOME/Downloads"

RAW_ZIP="$DOWNLOADS_DIR/study_raw_data_16076_030426-123134.zip"
BIOM_ZIP="$DOWNLOADS_DIR/study_16076_030426-123344.zip"

echo "============================================================"
echo " load_16076_network.sh — Study 16076 full processing network"
echo " All operations target: LOCAL Qiita (localhost only)"
echo "============================================================"

# ---------------------------------------------------------------------------
# Step 0: Find the study_id and prep_template_id for study 16076
# ---------------------------------------------------------------------------
echo ""
echo "[Step 0] Resolving study_id and prep_template_id for study 16076..."

read STUDY_ID PT_ID EXISTING_AID < <(python3 - <<'PYEOF'
import qiita_db as qdb

# Find study by title
target_title = "Ground beef shelf-life prediction"
study = None
for s in qdb.study.Study.iter():
    if s.title == target_title:
        study = s
        break

if study is None:
    print("ERROR: Study not found. Run load_studies_safe.sh first.", flush=True)
    exit(1)

preps = study.prep_templates()
pt = list(preps)[0]  # first (and only) prep template
existing_aid = pt.artifact.id if pt.artifact is not None else ""
print(study.id, pt.id, existing_aid)
PYEOF
)

if [ -z "$STUDY_ID" ] || [ "$STUDY_ID" = "ERROR:" ]; then
    echo "ERROR: Could not find study 16076. Please run load_studies_safe.sh first."
    exit 1
fi

echo "  study_id      = $STUDY_ID"
echo "  prep_template = $PT_ID"
echo "  existing_artifact = ${EXISTING_AID:-none}"

# ---------------------------------------------------------------------------
# Step 1: Extract zip files (skip if already extracted)
# ---------------------------------------------------------------------------
echo ""
echo "[Step 1] Checking/extracting zip files to $DATA_DIR ..."
mkdir -p "$DATA_DIR"

FASTQ_DIR="$DATA_DIR/per_sample_FASTQ/221886"
BIOM_BASE="$DATA_DIR/BIOM"

if [ -d "$FASTQ_DIR" ] && [ "$(ls -A "$FASTQ_DIR" 2>/dev/null)" ]; then
    echo "  FASTQ data already extracted at $FASTQ_DIR — skipping unzip."
else
    echo "  Extracting raw FASTQ data (~650 MB — this may take a minute)..."
    unzip -q -o "$RAW_ZIP" -d "$DATA_DIR"
    echo "  Done."
fi

if [ -d "$BIOM_BASE/221891" ] && [ "$(ls -A "$BIOM_BASE/221891" 2>/dev/null)" ]; then
    echo "  BIOM artifacts already extracted at $BIOM_BASE — skipping unzip."
else
    echo "  Extracting BIOM artifacts..."
    unzip -q -o "$BIOM_ZIP" -d "$DATA_DIR"
    echo "  Done."
fi

# ---------------------------------------------------------------------------
# Step 2: Load per_sample_FASTQ root artifact (221886)
#         If prep template already has an artifact, use it as the root parent.
# ---------------------------------------------------------------------------
echo ""
echo "[Step 2] Loading per_sample_FASTQ root artifact (221886)..."

if [ -n "$EXISTING_AID" ]; then
    echo "  Prep template $PT_ID already has artifact $EXISTING_AID — using it as root parent."
    AID_221886="$EXISTING_AID"
else
    # Build --fp / --fp_type args for all R1 and R2 files
    FP_ARGS=""
    for r1 in "$FASTQ_DIR"/*_R1.fastq.gz; do
        FP_ARGS="$FP_ARGS --fp $r1 --fp_type raw_forward_seqs"
        r2="${r1/_R1.fastq.gz/_R2.fastq.gz}"
        if [ -f "$r2" ]; then
            FP_ARGS="$FP_ARGS --fp $r2 --fp_type raw_reverse_seqs"
        fi
    done

    output=$(eval "qiita db load-artifact \
        --artifact_type per_sample_FASTQ \
        $FP_ARGS \
        --prep_template $PT_ID")
    echo "  $output"
    AID_221886=$(echo "$output" | grep -oP '(?<=Artifact )\d+')
fi

echo "  -> local artifact_id for 221886 = $AID_221886"

# ---------------------------------------------------------------------------
# Steps 3–6: Insert all BIOM artifacts via Python (bypasses ORM validation)
# ---------------------------------------------------------------------------
echo ""
echo "[Step 3] Inserting BIOM artifacts via load_16076_bioms.py ..."
python3 "$SCRIPT_DIR/load_16076_bioms.py"

echo ""
echo "============================================================"
echo " Done! Refresh your Qiita UI at https://localhost:21174/"
echo "============================================================"

#!/bin/bash -xe
# =============================================================================
# load_studies_safe.sh
#
# Loads studies 895, 1235, and 16076 from test_data_studies/ into the LOCAL
# Qiita postgres database (localhost only). Does NOT drop or recreate the
# environment — safe to run against an existing database.
#
# Run this from the root of the qiita-web project directory:
#   bash load_studies_safe.sh
# =============================================================================

export PGDATESTYLE="ISO, MDY"

OWNER="admin@foo.bar"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STUDIES_DIR="$SCRIPT_DIR/test_data_studies/studies"
TEMP_DIR="$SCRIPT_DIR/temp_load_$$"

mkdir -p "$TEMP_DIR"

studies=(895 1235 16076)

echo "=============================================="
echo " Loading studies into LOCAL Qiita database"
echo " Owner: $OWNER"
echo " Studies: ${studies[*]}"
echo "=============================================="

for i in "${studies[@]}"; do
    echo ""
    echo "----------------------------------------------"
    echo " Processing study $i"
    echo "----------------------------------------------"

    sample_file="$STUDIES_DIR/$i/sample_template_$i.txt"
    prep_file="$STUDIES_DIR/$i/prep_template_$i.txt"
    otu_table="$STUDIES_DIR/$i/otu_table.biom"
    conf_fp="$TEMP_DIR/study_config_$i.txt"

    # Extract the TITLE from the sample template (case-insensitive column match)
    title=$(python3 -c "
import sys
with open('$sample_file') as f:
    headers = f.readline().strip().split('\t')
    row = f.readline().strip().split('\t')
    d = dict(zip([h.upper() for h in headers], row))
    print(d.get('TITLE', 'Unknown Study $i'))
")
    echo "  Title: $title"

    # Generate the study config file
    echo "  Generating study config..."
    cat > "$conf_fp" <<EOF
[required]
timeseries_type_id = 1
metadata_complete = True
mixs_compliant = True
principal_investigator = Earth Microbiome Project, emp@earthmicrobiome.org, UCSD
reprocess = False
study_alias = $title
study_description = $title
study_abstract = $title
efo_ids = 1

[optional]
EOF

    # Load the study
    echo "  Loading study..."
    output=$(qiita db load-study --owner "$OWNER" --title "$title" --info "$conf_fp")
    echo "  $output"
    study_id=$(echo "$output" | grep -oP '(?<=ID: )\d+' || echo "$output" | awk '{print $NF}')
    echo "  -> study_id = $study_id"

    # Load the sample template
    echo "  Loading sample template..."
    qiita db load-sample-template "$sample_file" --study "$study_id"

    # Load the prep template
    echo "  Loading prep template..."
    output=$(qiita db load-prep-template "$prep_file" --study "$study_id" --data_type "16S")
    echo "  $output"
    pt_id=$(echo "$output" | grep -oP '(?<=ID: )\d+' || echo "$output" | awk '{print $NF}')
    echo "  -> prep_template_id = $pt_id"

    # Load the BIOM artifact (copy first so the original isn't modified)
    echo "  Loading BIOM artifact..."
    cp "$otu_table" "${otu_table}_backup"
    output=$(qiita db load-artifact \
        --artifact_type BIOM \
        --fp "$otu_table" \
        --fp_type biom \
        --prep_template "$pt_id")
    echo "  $output"
    artifact_id=$(echo "$output" | grep -oP '(?<=ID: )\d+' || echo "$output" | awk '{print $NF}')
    echo "  -> artifact_id = $artifact_id"
    mv "${otu_table}_backup" "$otu_table"

    # Make the study public
    echo "  Making study public..."
    python3 - <<PYEOF
from qiita_db.artifact import Artifact
a = Artifact($artifact_id)
a.visibility = 'public'
print("  Artifact $artifact_id visibility set to: public")
PYEOF

    echo "  Study $i loaded successfully (study_id=$study_id, artifact_id=$artifact_id)"
done

# Clean up temp files
rm -rf "$TEMP_DIR"

echo ""
echo "=============================================="
echo " All studies loaded. Verifying public status..."
echo "=============================================="

python3 - <<PYEOF
from qiita_db.study import Study
studies = Study.get_by_status('public')
aids = sorted([a.id for s in studies for a in s.artifacts()])
print(f"Public artifact IDs: {aids}")
print(f"Total public studies: {len(list(studies))}")
PYEOF

echo ""
echo "Done. Refresh your Qiita UI at https://localhost:21174/"

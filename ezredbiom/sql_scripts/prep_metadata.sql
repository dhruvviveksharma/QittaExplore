-- ⚠️ The table name prep_{prep_template_id} must match your prep template ID
SELECT
    pts.sample_id,
    p.sample_values->>'barcode'     AS barcode,
    p.sample_values->>'primer'      AS primer,
    p.sample_values->>'platform'    AS platform,
    p.sample_values->>'run_prefix'  AS run_prefix,
    p.sample_values->>'target_gene' AS target_gene,
    p.sample_values->>'instrument_model' AS instrument_model
FROM qiita.prep_template_sample pts
JOIN qiita.prep_1 p ON pts.sample_id = p.sample_id  -- ← swap prep_1 to prep_{prep_template_id}
WHERE pts.prep_template_id = 1                        -- ← change this
  AND pts.sample_id <> 'qiita_sample_column_names'
ORDER BY pts.sample_id;

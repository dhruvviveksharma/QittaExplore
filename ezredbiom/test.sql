-- Query the prep_10052 table
SELECT * FROM qiita.prep_10052 LIMIT 10;

-- See its structure
\d qiita.prep_10052

-- Count rows
SELECT COUNT(*) FROM qiita.prep_10052;

-- See all columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'qiita' 
  AND table_name = 'prep_10052'
ORDER BY ordinal_position;
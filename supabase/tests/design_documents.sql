begin;
select plan(5);

select is(public.design_document_asset_ids('{}'), '{}'::uuid[], 'empty documents have no assets');
select is(public.design_document_asset_ids('{"layers":[{"assetId":"00000000-0000-4000-8000-000000000001"}]}'),
  array['00000000-0000-4000-8000-000000000001']::uuid[], 'legacy assets remain discoverable');
select is(cardinality(public.design_document_asset_ids('{
  "pages":[{"children":[{"children":[{"fill":{
    "assetId":"00000000-0000-4000-8000-000000000001",
    "maskAssetId":"00000000-0000-4000-8000-000000000002"
  }}]}]}],
  "assets":[{"id":"00000000-0000-4000-8000-000000000001"}],
  "fonts":[{"assetId":"00000000-0000-4000-8000-000000000003"}]
}')), 3, 'nested images, masks and fonts are deduplicated');
select ok(not has_table_privilege('authenticated', 'public.slide_design_assets', 'INSERT'), 'clients cannot change protected references');
select ok(not has_function_privilege('anon', 'public.save_slide_design(uuid,uuid,uuid,uuid,jsonb,jsonb,timestamp with time zone)', 'EXECUTE'),
  'anonymous callers cannot save a design');

select * from finish();
rollback;

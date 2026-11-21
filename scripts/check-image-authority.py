"""Execute the production prompt builder with QuickJS; no image calls."""
import json,re,sys
from pathlib import Path
sys.path.insert(0,'/tmp/carousely-qa')
import quickjs
s=(Path(__file__).resolve().parents[1]/'src/lib/image-ai.ts').read_text()
s=s[s.index('const ROLE_LINES:'):s.index('const SKIPPED_LABELS:')]
s=re.sub(r'interface ImageContext \{.*?\n\}', '', s, flags=re.S)
s=re.sub(r': Record<[^>]+>', '', s)
s=s.replace('image: PromptImage','image').replace('role: SlideRole | null','role').replace('index: number','index').replace('context: ImageContext','context').replace('brand: BrandVisual | null','brand').replace('brand: BrandVisual','brand').replace('styled: boolean','styled').replace('const lines: string[]','const lines').replace('): string[]',')').replace('): string',')')
s=s.replace("input: Pick<ImageInput, 'scene' | 'headline' | 'format' | 'slide'>",'input').replace('images: PromptImage[]','images').replace('const layoutRole: LayoutRole','const layoutRole').replace('export ','')
c=quickjs.Context();c.eval("const IMAGE_FORMATS={'4:5':{aspect:'4:5'}};const HEADLINE_MAX_LENGTH=300;const DEFAULT_HEADING_FONT='DefaultHead',DEFAULT_BODY_FONT='DefaultBody';const styleForBrand=()=>null;");c.eval(s)
brand=dict(name='Test',colors=[dict(role='latar',hex='#123456')],headingFont='BrandHead',bodyFont='BrandBody')
def prompt(images):
 return c.eval('buildImagePrompt('+json.dumps(dict(scene='reference geometry',headline='Title\nBody',format='4:5',slide=dict(index=2,count=5,role='isi')))+','+json.dumps(brand)+','+json.dumps(images)+')')
p=prompt([dict(kind='reference',label='isi')])
assert 'copy its layout' in p and '#123456' in p and 'BrandHead' in p
assert 'text is the main element and takes the larger share' not in p, 'Reference geometry overridden by generic text/photo ratio'
assert 'text is the main element and takes the larger share' in prompt([]), 'No-reference fallback lost'
print('PASS: reference geometry owns ratio; brand owns palette/fonts; fallback retained')

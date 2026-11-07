#!/usr/bin/env python3
"""Publish a new varys edition.

  VARYS_PASS=... python3 setup/publish.py new.json

new.json = the full data for the new edition (same format as data.enc's plaintext). This script:
  1. keeps the `ts` of items that were already published (ts = first time an item appeared in varys);
     new items without ts get now (Asia/Taipei);
  2. writes every item into the permanent archive archive/YYYY-MM.enc (by ts month; same id is updated, never duplicated),
     plus firsthand, deep chapters and monthly reports;
  3. drops items older than 15 days from the live data (archive keeps them);
  4. seals data.enc and checks it opens.
"""
import json, os, sys, datetime, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from seal import seal, open_

R = pathlib.Path(__file__).resolve().parent.parent
TPE = datetime.timezone(datetime.timedelta(hours=8))
KEEP_DAYS = 15

def ts_of(it):
    try: return datetime.datetime.fromisoformat(it['ts'])
    except Exception: return None

def main(src):
    pw = os.environ['VARYS_PASS']
    new = json.load(open(src, encoding='utf-8'))
    old = open_(R / 'data.enc', pw) if (R / 'data.enc').exists() else {}
    known = {i['id']: i.get('ts') for i in old.get('items', []) + old.get('firsthand', [])}
    now = datetime.datetime.now(TPE).replace(microsecond=0)
    for group in (new.get('items', []), new.get('firsthand', []), new.get('deep', {}).get('items', []), new.get('monthly', [])):
        for it in group:
            if known.get(it['id']): it['ts'] = known[it['id']]
            elif not it.get('ts'): it['ts'] = now.isoformat()

    # permanent archive, one encrypted file per month
    (R / 'archive').mkdir(exist_ok=True)
    buckets = {}
    def put(kind, it):
        t = ts_of(it) or now
        buckets.setdefault(t.strftime('%Y-%m'), {}).setdefault(kind, {})[it['id']] = it
    for it in new.get('items', []): put('items', it)
    for it in new.get('firsthand', []): put('firsthand', it)
    for it in new.get('deep', {}).get('items', []): put('deep', it)
    for it in new.get('monthly', []): put('monthly', it)
    ed = new.get('edition', {})
    for month, kinds in buckets.items():
        path = R / 'archive' / f'{month}.enc'
        arc = open_(path, pw) if path.exists() else {'month': month, 'items': [], 'firsthand': [], 'deep': [], 'monthly': [], 'editions': []}
        for kind, byid in kinds.items():
            cur = {i['id']: i for i in arc.get(kind, [])}
            cur.update(byid)
            arc[kind] = sorted(cur.values(), key=lambda i: i.get('ts', ''))
        if ed.get('id') and ed['id'] not in [e.get('id') for e in arc.get('editions', [])] and month == now.strftime('%Y-%m'):
            arc.setdefault('editions', []).append({'id': ed['id'], 'label': ed.get('label'), 'bluf': new.get('bluf', []), 'radar': new.get('radar', [])})
        tmp = R / f'archive/.{month}.json'
        json.dump(arc, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False)
        seal(tmp, path, pw); tmp.unlink()

    # live data keeps 15 days
    cut = now - datetime.timedelta(days=KEEP_DAYS)
    new['items'] = [i for i in new.get('items', []) if (ts_of(i) or now) >= cut]
    new['version'] = 2
    tmp = R / '.data.json'
    json.dump(new, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False)
    seal(tmp, R / 'data.enc', pw); tmp.unlink()
    print(f"live items {len(new['items'])}, archive months {sorted(buckets)}")

if __name__ == '__main__':
    main(sys.argv[1])

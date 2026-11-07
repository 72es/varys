#!/usr/bin/env python3
"""Seal / open varys data.

The page only ever ships data.enc: AES-256-GCM over the JSON, key = PBKDF2-SHA256(passphrase, salt).
The salt is kept from the previous data.enc so a device that already unlocked stays unlocked.

  seal:  VARYS_PASS=... python3 setup/seal.py seal data.json data.enc
  open:  VARYS_PASS=... python3 setup/seal.py open data.enc data.json
"""
import base64, hashlib, json, os, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITER = 600_000

def key_for(passphrase, salt):
    import unicodedata
    p = unicodedata.normalize('NFKC', passphrase).strip().encode()
    return hashlib.pbkdf2_hmac('sha256', p, salt, ITER, 32)

def b64(b): return base64.b64encode(b).decode()

def seal(src, dst, passphrase):
    data = json.load(open(src, encoding='utf-8'))
    salt = None
    if os.path.exists(dst):
        try: salt = base64.b64decode(json.load(open(dst))['salt'])
        except Exception: salt = None
    salt = salt or os.urandom(16)
    iv = os.urandom(12)
    ct = AESGCM(key_for(passphrase, salt)).encrypt(iv, json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode(), None)
    json.dump({'v': 1, 'kdf': 'PBKDF2-SHA256', 'iter': ITER, 'salt': b64(salt), 'iv': b64(iv), 'ct': b64(ct)}, open(dst, 'w'))
    # self-check
    assert open_(dst, passphrase) == data
    print(f'sealed {src} -> {dst} ({os.path.getsize(dst)//1024} KB)')

def open_(src, passphrase):
    env = json.load(open(src))
    pt = AESGCM(key_for(passphrase, base64.b64decode(env['salt']))).decrypt(base64.b64decode(env['iv']), base64.b64decode(env['ct']), None)
    return json.loads(pt)

if __name__ == '__main__':
    cmd, a, b = sys.argv[1:4]
    pw = os.environ.get('VARYS_PASS')
    if not pw: sys.exit('set VARYS_PASS')
    if cmd == 'seal': seal(a, b, pw)
    elif cmd == 'open': json.dump(open_(a, pw), open(b, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); print('opened', a, '->', b)
    else: sys.exit('seal | open')

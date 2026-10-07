#!/usr/bin/env python3
"""把公有領域的經文資料轉成 app 內建用的精簡 JSON（src/data/bible/*.json）。

來源與授權（詳見 src/data/bible/SOURCES.md）：
  和合本 CUV：https://github.com/midvash/bible-data （versions/zh/cuv/cuv.json）
  BSB：       https://github.com/scrollmapper/bible_databases （2025 分支 formats/json/BSB.json）
  SBLGNT：    https://github.com/LogosBible/SBLGNT （data/sblgnt/text/<書卷>.txt，CC BY 4.0）

用法：python3 scripts/build_bible_data.py cuv.json bsb.json sblgnt_dir/
  sblgnt_dir 裡是 27 個 <OSIS>.txt（Matt.txt、Mark.txt…），每行「書卷 章:節<TAB>文字」，第一行是書名標題。
輸出格式：{ "id", "name", "books": { "<OSIS>": [ [第1節文字, 第2節文字, …], …每章… ] } }
缺的節（例如和合本沒有的經節）用空字串；節號對應陣列索引 + 1。
"""
import json, sys, re

OSIS = ["Gen","Exod","Lev","Num","Deut","Josh","Judg","Ruth","1Sam","2Sam","1Kgs","2Kgs","1Chr","2Chr","Ezra","Neh","Esth","Job","Ps","Prov","Eccl","Song","Isa","Jer","Lam","Ezek","Dan","Hos","Joel","Amos","Obad","Jonah","Mic","Nah","Hab","Zeph","Hag","Zech","Mal","Matt","Mark","Luke","John","Acts","Rom","1Cor","2Cor","Gal","Eph","Phil","Col","1Thess","2Thess","1Tim","2Tim","Titus","Phlm","Heb","Jas","1Pet","2Pet","1John","2John","3John","Jude","Rev"]

def pack(chapters):
    out = []
    for ch in chapters:
        verses = ch['verses']
        n = max(int(v.get('number', v.get('verse'))) for v in verses)
        arr = [''] * n
        for v in verses:
            num = int(v.get('number', v.get('verse')))
            arr[num - 1] = re.sub(r'\s+', ' ', v['text']).strip()
        out.append(arr)
    return out

def sblgnt(dir_):
    """SBLGNT：去掉版本記號（⸀⸁⸂⸃⸄⸅）；保留文字裡的 [ ] 和 ⟦ ⟧（那是文本本身的括號）。只有新約。"""
    books = {}
    for code in OSIS[39:]:
        chapters = {}
        for line in open(f'{dir_}/{code}.txt', encoding='utf-8'):
            m = re.match(r'^(\S+) (\d+):(\d+)\t(.*)$', line.rstrip('\n'))
            if not m:
                continue  # 書名標題
            assert m.group(1) == code, (code, line[:30])
            text = re.sub('[\u2e00-\u2e05]', '', m.group(4))
            chapters.setdefault(int(m.group(2)), []).append({'number': int(m.group(3)), 'text': text})
        books[code] = pack([{'verses': chapters[c]} for c in sorted(chapters)])
    return books

def main(cuv_path, bsb_path, sbl_dir=None):
    cuv = json.load(open(cuv_path, encoding='utf-8'))
    books = {}
    for b in cuv['books']:
        assert b['book'] in OSIS, b['book']
        books[b['book']] = pack(b['chapters'])
    assert list(books) == OSIS, 'CUV 書卷順序不符'
    json.dump({'id': 'cuv', 'name': '和合本 (Chinese Union Version, 1919)', 'books': books}, open('src/data/bible/cuv.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    bsb = json.load(open(bsb_path, encoding='utf-8'))
    assert len(bsb['books']) == 66
    books = {}
    for code, b in zip(OSIS, bsb['books']):
        books[code] = pack(b['chapters'])
    if sbl_dir:
        json.dump({'id': 'sblgnt', 'name': 'SBL Greek New Testament', 'books': sblgnt(sbl_dir)}, open('src/data/bible/sblgnt.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump({'id': 'bsb', 'name': 'Berean Standard Bible', 'books': books}, open('src/data/bible/bsb.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)

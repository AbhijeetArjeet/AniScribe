import os
import sys
import json
import urllib.request
import soundfile as sf
import numpy as np

sys.stdout.reconfigure(encoding='utf-8')

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

import time

def download_audio_file(url, out_path):
    if os.path.exists(out_path) and os.path.getsize(out_path) > 100:
        return True
    for attempt in range(4):
        try:
            time.sleep(2.5) # Gentle pause between requests
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as resp, open(out_path, 'wb') as f:
                f.write(resp.read())
            return True
        except Exception as e:
            print(f"Attempt {attempt+1} downloading {url} failed: {e}")
            time.sleep(3.0 * (attempt + 1))
    return False

def read_resample_audio(file_path):
    data, sr = sf.read(file_path)
    if data.ndim > 1:
        data = data.mean(axis=1)
    if sr != 16000:
        duration = len(data) / sr
        indices = np.linspace(0, len(data) - 1, int(duration * 16000))
        data = np.interp(indices, np.arange(len(data)), data).astype(np.float32)
        sr = 16000
    return data.astype(np.float32)

def assemble_dataset(lang, entries, target_dur_sec=180.0):
    cache_dir = os.path.join("tests", "fixtures", "multilingual", f"raw_{lang}")
    os.makedirs(cache_dir, exist_ok=True)
    out_wav = os.path.join("tests", "fixtures", "multilingual", f"{lang}_3min.wav")
    out_ref = os.path.join("tests", "fixtures", "multilingual", f"{lang}_reference.json")

    loaded = []
    for item in entries:
        local_path = item.get("local_path")
        if not local_path:
            filename = item["id"] + ".wav"
            local_path = os.path.join(cache_dir, filename)
            if not download_audio_file(item["url"], local_path):
                continue
        try:
            audio = read_resample_audio(local_path)
            loaded.append({
                "audio": audio,
                "text": item["text"],
                "translation": item["translation"]
            })
            print(f"Loaded {lang}: {item['text']} ({len(audio)/16000.0:.2f}s)")
        except Exception as e:
            print(f"Error reading {local_path}: {e}")

    if not loaded:
        print(f"Failed: No audio loaded for {lang}")
        return

    # Assemble into target_dur_sec
    cues = []
    audio_chunks = []
    cur_sec = 0.5
    audio_chunks.append(np.zeros(int(0.5 * 16000), dtype=np.float32))

    idx = 0
    full_texts = []
    full_translations = []

    while cur_sec < target_dur_sec:
        entry = loaded[idx % len(loaded)]
        idx += 1
        dur = len(entry["audio"]) / 16000.0
        start_t = round(cur_sec, 3)
        end_t = round(cur_sec + dur, 3)

        cues.append({
            "start": start_t,
            "end": end_t,
            "text": entry["text"],
            "english": entry["translation"]
        })
        full_texts.append(entry["text"])
        full_translations.append(entry["translation"])

        audio_chunks.append(entry["audio"])
        pause = 1.6 if (idx % 2 == 0) else 2.4
        audio_chunks.append(np.zeros(int(pause * 16000), dtype=np.float32))
        cur_sec = end_t + pause

    combined = np.concatenate(audio_chunks).astype(np.float32)
    peak = np.max(np.abs(combined))
    if peak > 0:
        combined = (combined / peak) * 0.9

    sf.write(out_wav, combined, 16000)
    actual_dur = len(combined) / 16000.0

    meta = {
        "audio_file": out_wav.replace("\\", "/"),
        "language": lang,
        "duration_seconds": round(actual_dur, 2),
        "sample_rate": 16000,
        "cue_count": len(cues),
        "license": "Creative Commons Attribution-ShareAlike (CC BY-SA)",
        "source": "Wikimedia Commons Lingua Libre Speech",
        "cues": cues,
        "full_text": " ".join(full_texts),
        "full_english": " ".join(full_translations)
    }

    with open(out_ref, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"Generated {out_wav}: {actual_dur:.2f}s, {len(cues)} speech cues.")

def main():
    # 1. Japanese (using existing verified raw files)
    ja_raw_dir = os.path.join("tests", "fixtures", "raw_ja")
    ja_entries = [
        {"local_path": os.path.join(ja_raw_dir, "Ja-1-ichi.ogg"), "text": "一", "translation": "One"},
        {"local_path": os.path.join(ja_raw_dir, "Ja-2-ni.ogg"), "text": "二", "translation": "Two"},
        {"local_path": os.path.join(ja_raw_dir, "Ja-3-san.ogg"), "text": "三", "translation": "Three"},
        {"local_path": os.path.join(ja_raw_dir, "Ja-4-shi.ogg"), "text": "四", "translation": "Four"},
        {"local_path": os.path.join(ja_raw_dir, "Ja-5-go.ogg"), "text": "五", "translation": "Five"},
        {"local_path": os.path.join(ja_raw_dir, "Ja-10-jyuu.ogg"), "text": "十", "translation": "Ten"},
    ]

    # 2. Korean entries
    ko_entries = [
        {
            "id": "ko_hello",
            "url": "https://upload.wikimedia.org/wikipedia/commons/f/ff/LL-Q9176_%28kor%29-CHK2605-%EC%95%88%EB%85%95.wav",
            "text": "안녕",
            "translation": "Hello"
        },
        {
            "id": "ko_tomorrow",
            "url": "https://upload.wikimedia.org/wikipedia/commons/b/b6/LL-Q9176_%28kor%29-CHK2605-%EB%82%B4%EC%9D%BC.wav",
            "text": "내일",
            "translation": "Tomorrow"
        },
        {
            "id": "ko_month",
            "url": "https://upload.wikimedia.org/wikipedia/commons/1/11/LL-Q9176_%28kor%29-CHK2605-%EC%9B%94.wav",
            "text": "월",
            "translation": "Month"
        },
        {
            "id": "ko_bat",
            "url": "https://upload.wikimedia.org/wikipedia/commons/7/76/LL-Q9176_%28kor%29-CHK2605-%EB%B0%95%EC%A5%90.wav",
            "text": "박쥐",
            "translation": "Bat"
        }
    ]

    # 3. Chinese entries
    zh_entries = [
        {
            "id": "zh_80",
            "url": "https://upload.wikimedia.org/wikipedia/commons/0/05/LL-Q9192_%28cmn%29-Luilui6666-80_%E5%9D%97%E9%92%B1.wav",
            "text": "80块钱",
            "translation": "80 yuan"
        },
        {
            "id": "zh_88",
            "url": "https://upload.wikimedia.org/wikipedia/commons/e/ee/LL-Q9192_%28cmn%29-Luilui6666-88_%E5%9D%97%E9%92%B1.wav",
            "text": "88块钱",
            "translation": "88 yuan"
        },
        {
            "id": "zh_102",
            "url": "https://upload.wikimedia.org/wikipedia/commons/d/d2/LL-Q9192_%28cmn%29-Luilui6666-102_%E5%9D%97%E9%92%B1.wav",
            "text": "102块钱",
            "translation": "102 yuan"
        },
        {
            "id": "zh_time",
            "url": "https://upload.wikimedia.org/wikipedia/commons/9/94/LL-Q9192_%28cmn%29-Luilui6666-17-45.wav",
            "text": "17-45",
            "translation": "17:45"
        }
    ]

    print("Building Japanese 3-minute dataset...")
    assemble_dataset("ja", ja_entries, 180.0)

    print("\nBuilding Korean 3-minute dataset...")
    assemble_dataset("ko", ko_entries, 180.0)

    print("\nBuilding Chinese 3-minute dataset...")
    assemble_dataset("zh", zh_entries, 180.0)

if __name__ == "__main__":
    main()

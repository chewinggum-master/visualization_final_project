import pandas as pd
import os

INPUT_FILE = 'Most Streamed Spotify Songs 2024.csv'
OUTPUT_FILE = 'data/Most Streamed Spotify Songs 2024_selected.csv'

# 確保 data 目錄存在
os.makedirs('data', exist_ok=True)

# 使用 windows-1252 編碼讀取 CSV
print(f"正在讀取文件: {INPUT_FILE}")
df = pd.read_csv(INPUT_FILE, encoding='windows-1252')

# 使用者指定欄位（含更正拼寫）
requested_cols = [
    'Track',
    'Artist',
    'Release Date',  # 更正 'Realease Date' -> 'Release Date'
    'ISRC',
    'All Time Rank',
    'Spotify Streams',
    'YouTube Views',
    'TikTok Views',
    'Pandora Streams',
    'Soundcloud Streams',
    'Shazam Counts',
]

available_cols = [c for c in requested_cols if c in df.columns]
missing_cols = [c for c in requested_cols if c not in df.columns]

if missing_cols:
    print("以下欄位在原始資料中未找到，將略過：")
    for c in missing_cols:
        print(f" - {c}")

# 選取存在的欄位
selected = df[available_cols].copy()

print(f"原始欄位數: {len(df.columns)}，保留欄位數: {len(available_cols)}")
print(f"保留欄位: {available_cols}")

# 輸出結果
selected.to_csv(OUTPUT_FILE, index=False, encoding='windows-1252')
print(f"已輸出到: {OUTPUT_FILE}")

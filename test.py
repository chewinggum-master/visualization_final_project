import os
import pandas as pd

# This script loads the local CSV and shows a quick preview.
# If you prefer loading directly from Kaggle via kagglehub, see notes below.

CSV_NAME = "Most Streamed Spotify Songs 2024.csv"
csv_path = os.path.join(os.path.dirname(__file__), CSV_NAME)

if not os.path.exists(csv_path):
    raise FileNotFoundError(f"CSV not found at: {csv_path}")

# Try multiple common encodings to avoid UnicodeDecodeError
# Prioritize Windows-1252 as per your CSV hint
encodings_to_try = [
    "cp1252",    # Windows-1252
    "utf-8",
    "utf-8-sig",
    "latin-1",   # ISO-8859-1
    "cp950",     # Traditional Chinese (Windows)
]

last_error = None
df = None
for enc in encodings_to_try:
    try:
        df = pd.read_csv(csv_path, encoding=enc)
        print(f"Loaded with encoding: {enc}")
        break
    except Exception as e:
        last_error = e

if df is None:
    raise RuntimeError(f"Failed to read CSV with tried encodings {encodings_to_try}: {last_error}")

print("Rows:", len(df))
print("Columns:", list(df.columns))
print("First 5 records:\n", df.head())

# Optional: Load from Kaggle with kagglehub instead of local file
# Install first: pip install kagglehub[pandas-datasets]
# Then uncomment and use:
# import kagglehub
# from kagglehub import KaggleDatasetAdapter
# df = kagglehub.load_dataset(
#     KaggleDatasetAdapter.PANDAS,
#     "nelgiriyewithana/most-streamed-spotify-songs-2024",
#     "Most Streamed Spotify Songs 2024.csv",
# )
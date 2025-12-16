import pandas as pd

# 讀取CSV文件（只做缺失值統計，不做刪除與輸出）
input_file = 'data\Most Streamed Spotify Songs 2024.csv'

print(f"正在讀取文件: {input_file}")
# 使用 windows-1252 編碼讀取文件
df = pd.read_csv(input_file, encoding='windows-1252')

# 顯示原始數據的基本信息
print(f"\n原始數據形狀: {df.shape}")
print(f"總共有 {df.shape[0]} 筆資料，{df.shape[1]} 個欄位")

# 計算缺失值
missing_count = df.isnull().sum()
total_missing = int(missing_count.sum())
rows_with_any_na = int(df.isnull().any(axis=1).sum())

print(f"\n缺失值總數: {total_missing}")
print(f"包含缺失值的列數: {(missing_count > 0).sum()}")
print(f"包含任一缺失值的列數據列數(筆數): {rows_with_any_na}")

# 顯示各欄位的缺失值數量
if total_missing > 0:
    print("\n各欄位缺失值統計:")
    for col in df.columns:
        cnt = int(missing_count[col])
        if cnt > 0:
            pct = cnt / len(df) * 100 if len(df) else 0
            print(f"  {col}: {cnt} ({pct:.2f}%)")
else:
    print("\n資料集中沒有缺失值。")

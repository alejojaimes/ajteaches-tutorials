# scripts/prepare_csv.py
import pandas as pd

SHEET_TO_FILENAME = {
    "Year 2009-2010": "online_retail_ii_2009_2010.csv",
    "Year 2010-2011": "online_retail_ii_2010_2011.csv",
}

xls = pd.ExcelFile("data/online_retail_II.xlsx")

for sheet_name, filename in SHEET_TO_FILENAME.items():
    df = xls.parse(sheet_name)
    output_path = f"data/{filename}"
    df.to_csv(output_path, index=False)
    print(f"{filename} generated: {len(df):,} rows")

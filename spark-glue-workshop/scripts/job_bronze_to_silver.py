# scripts/job_bronze_to_silver.py
"""Glue job: Bronze to Silver.

Reads the raw CSV files from the Bronze layer, cleans and types the
data, and writes the result as partitioned Parquet to the Silver
layer.
"""

import sys

from awsglue.context import GlueContext
from awsglue.job import Job
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from pyspark.sql import functions as F

# --- Step 1: Initialize Glue job and logger ---
args = getResolvedOptions(sys.argv, ["JOB_NAME", "BUCKET"])
BUCKET = args["BUCKET"]

sc = SparkContext()
glue_context = GlueContext(sc)
spark = glue_context.spark_session
job = Job(glue_context)
job.init(args["JOB_NAME"], args)

logger = glue_context.get_logger()
logger.info("STEP 1 - Job initialized. Bucket: %s" % BUCKET)

# --- Step 2: Read raw CSV from Bronze ---
try:
    df = (
        spark.read.option("header", "true")
        .option("inferSchema", "true")
        .csv(f"s3://{BUCKET}/bronze/")
    )
    input_count = df.count()
    logger.info("STEP 2 - Read succeeded. Rows read from bronze/: %d" % input_count)
except Exception as error:
    logger.error("STEP 2 - Failed to read from bronze/: %s" % str(error))
    raise

# --- Step 3: Normalize column names ---
try:
    renames = {
        "Invoice": "invoice",
        "InvoiceNo": "invoice",
        "StockCode": "stock_code",
        "Description": "description",
        "Quantity": "quantity",
        "InvoiceDate": "invoice_date",
        "Price": "price",
        "UnitPrice": "price",
        "Customer ID": "customer_id",
        "CustomerID": "customer_id",
        "Country": "country",
    }
    for old_name, new_name in renames.items():
        if old_name in df.columns:
            df = df.withColumnRenamed(old_name, new_name)
    logger.info("STEP 3 - Column names normalized.")
except Exception as error:
    logger.error("STEP 3 - Failed to normalize columns: %s" % str(error))
    raise

# --- Step 4: Cast types ---
try:
    df = (
        df.withColumn("quantity", F.col("quantity").cast("int"))
        .withColumn("price", F.col("price").cast("double"))
        .withColumn(
            "customer_id",
            F.col("customer_id").cast("double").cast("long"),
        )
        .withColumn("invoice_date", F.to_timestamp("invoice_date"))
    )
    logger.info("STEP 4 - Types cast successfully.")
except Exception as error:
    logger.error("STEP 4 - Failed to cast types: %s" % str(error))
    raise

# --- Step 5: Filter invalid records ---
try:
    df = df.filter(
        F.col("invoice").isNotNull()
        & F.col("stock_code").isNotNull()
        & F.col("price").isNotNull()
        & (F.col("price") >= 0)
    )
    filtered_count = df.count()
    logger.info("STEP 5 - Filter applied. Rows remaining: %d" % filtered_count)
except Exception as error:
    logger.error("STEP 5 - Failed to filter records: %s" % str(error))
    raise

# --- Step 6: Derived columns and deduplication ---
try:
    df = (
        df.withColumn("is_return", F.col("invoice").startswith("C"))
        .withColumn("year", F.year("invoice_date"))
        .withColumn("month", F.month("invoice_date"))
        .withColumn("day", F.dayofmonth("invoice_date"))
        .withColumn("weekday", F.date_format("invoice_date", "EEEE"))
        .withColumn(
            "total_amount",
            F.round(F.col("quantity") * F.col("price"), 2),
        )
        .withColumn("description", F.trim(F.upper(F.col("description"))))
        .withColumn("country", F.trim(F.col("country")))
        .dropDuplicates()
    )
    final_count = df.count()
    logger.info("STEP 6 - Derived columns added. Final row count: %d" % final_count)
except Exception as error:
    logger.error("STEP 6 - Failed to add derived columns: %s" % str(error))
    raise

# --- Step 7: Write clean Parquet to Silver, partitioned by year ---
try:
    (df.write.mode("overwrite").partitionBy("year").parquet(f"s3://{BUCKET}/silver/"))
    logger.info("STEP 7 - Write succeeded. Target: s3://%s/silver/" % BUCKET)
except Exception as error:
    logger.error("STEP 7 - Failed to write to silver/: %s" % str(error))
    raise

job.commit()
logger.info("Job finished successfully.")

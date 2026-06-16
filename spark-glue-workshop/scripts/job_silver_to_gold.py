# scripts/job_silver_to_gold.py
"""Glue job: Silver to Gold.

Reads the clean Parquet data from the Silver layer and builds a star
schema in the Gold layer: three dimension tables (product, customer,
date) and one fact table (sales), joined with broadcast joins to
avoid shuffling the large fact table.
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

GOLD_PATH = f"s3://{BUCKET}/gold/"

# --- Step 2: Read the Silver layer ---
try:
    silver = spark.read.parquet(f"s3://{BUCKET}/silver/")
    silver.cache()
    silver_count = silver.count()
    logger.info("STEP 2 - Read succeeded. Rows read from silver/: %d" % silver_count)
except Exception as error:
    logger.error("STEP 2 - Failed to read from silver/: %s" % str(error))
    raise

# --- Step 3: Build dim_product ---
try:
    dim_product = (
        silver.select("stock_code", "description")
        .dropDuplicates(["stock_code"])
        .withColumn("product_sk", F.monotonically_increasing_id())
    )
    logger.info("STEP 3 - dim_product built. Rows: %d" % dim_product.count())
except Exception as error:
    logger.error("STEP 3 - Failed to build dim_product: %s" % str(error))
    raise

# --- Step 4: Build dim_customer ---
try:
    dim_customer = (
        silver.select("customer_id", "country")
        .dropDuplicates(["customer_id", "country"])
        .withColumn("customer_sk", F.monotonically_increasing_id())
    )
    logger.info("STEP 4 - dim_customer built. Rows: %d" % dim_customer.count())
except Exception as error:
    logger.error("STEP 4 - Failed to build dim_customer: %s" % str(error))
    raise

# --- Step 5: Build dim_date ---
try:
    dim_date = (
        silver.select(
            F.to_date("invoice_date").alias("date"),
            "year",
            "month",
            "day",
            "weekday",
        )
        .dropDuplicates(["date"])
        .filter(F.col("date").isNotNull())
        .withColumn(
            "date_sk",
            F.date_format("date", "yyyyMMdd").cast("int"),
        )
    )
    logger.info("STEP 5 - dim_date built. Rows: %d" % dim_date.count())
except Exception as error:
    logger.error("STEP 5 - Failed to build dim_date: %s" % str(error))
    raise

# --- Step 6: Build fact_sales (broadcast joins to avoid shuffle) ---
try:
    fact = (
        silver.withColumn("date", F.to_date("invoice_date"))
        .join(
            F.broadcast(dim_product.select("stock_code", "product_sk")),
            on="stock_code",
            how="left",
        )
        .join(
            F.broadcast(dim_customer.select("customer_id", "country", "customer_sk")),
            on=["customer_id", "country"],
            how="left",
        )
        .join(
            F.broadcast(dim_date.select("date", "date_sk")),
            on="date",
            how="left",
        )
        .select(
            "invoice",
            "product_sk",
            "customer_sk",
            "date_sk",
            "quantity",
            F.col("price").alias("unit_price"),
            "total_amount",
            "is_return",
        )
    )
    fact_count = fact.count()
    logger.info("STEP 6 - fact_sales built. Rows: %d" % fact_count)
except Exception as error:
    logger.error("STEP 6 - Failed to build fact_sales: %s" % str(error))
    raise

# --- Step 7: Write the 4 tables to Gold ---
try:
    dim_product.write.mode("overwrite").parquet(f"{GOLD_PATH}dim_product/")
    dim_customer.write.mode("overwrite").parquet(f"{GOLD_PATH}dim_customer/")
    dim_date.write.mode("overwrite").parquet(f"{GOLD_PATH}dim_date/")
    fact.write.mode("overwrite").parquet(f"{GOLD_PATH}fact_sales/")
    logger.info("STEP 7 - Write succeeded. Target: %s" % GOLD_PATH)
except Exception as error:
    logger.error("STEP 7 - Failed to write to gold/: %s" % str(error))
    raise

job.commit()
logger.info("Job finished successfully.")

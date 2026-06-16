CREATE DATABASE IF NOT EXISTS workshop_gold;

CREATE EXTERNAL TABLE IF NOT EXISTS workshop_gold.dim_product (
  stock_code  string,
  description string,
  product_sk  bigint)
STORED AS PARQUET
LOCATION 's3://taller-spark-glue-datalake-032/gold/dim_product/';

CREATE EXTERNAL TABLE IF NOT EXISTS workshop_gold.dim_customer (
  customer_id bigint,
  country     string,
  customer_sk bigint)
STORED AS PARQUET
LOCATION 's3://taller-spark-glue-datalake-032/gold/dim_customer/';

CREATE EXTERNAL TABLE IF NOT EXISTS workshop_gold.dim_date (
  date     date,
  year     int,
  month    int,
  day      int,
  weekday  string,
  date_sk  int)
STORED AS PARQUET
LOCATION 's3://taller-spark-glue-datalake-032/gold/dim_date/';

CREATE EXTERNAL TABLE IF NOT EXISTS workshop_gold.fact_sales (
  invoice      string,
  product_sk   bigint,
  customer_sk  bigint,
  date_sk      int,
  quantity     int,
  unit_price   double,
  total_amount double,
  is_return    boolean)
STORED AS PARQUET
LOCATION 's3://taller-spark-glue-datalake-032/gold/fact_sales/';

# ============================================================
# QuakeLens - AWS Serverless Earthquake Data Pipeline
# Architecture: EventBridge -> Lambda -> S3 -> API Gateway
# Region: ap-south-1
# ============================================================

# ------------------------------------------------------------
# 1. S3 Bucket
# ------------------------------------------------------------

resource "aws_s3_bucket" "data" {
  bucket_prefix = "quakelens-feed-"
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket = aws_s3_bucket.data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# ------------------------------------------------------------
# 2. IAM Roles
# ------------------------------------------------------------

resource "aws_iam_role" "ingest" {
  name_prefix = "quakelens-ingest-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Effect = "Allow"

        Principal = {
          Service = "lambda.amazonaws.com"
        }

        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role" "read" {
  name_prefix = "quakelens-read-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Effect = "Allow"

        Principal = {
          Service = "lambda.amazonaws.com"
        }

        Action = "sts:AssumeRole"
      }
    ]
  })
}

# ------------------------------------------------------------
# 3. IAM Policy Attachments
# ------------------------------------------------------------

resource "aws_iam_role_policy_attachment" "ingest_basic" {
  role       = aws_iam_role.ingest.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "read_basic" {
  role       = aws_iam_role.read.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ------------------------------------------------------------
# 4. S3 Permissions
# ------------------------------------------------------------

resource "aws_iam_role_policy" "ingest_s3" {
  role = aws_iam_role.ingest.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.data.arn}/earthquakes/latest.geojson"
      }
    ]
  })
}

resource "aws_iam_role_policy" "read_s3" {
  role = aws_iam_role.read.id

  policy = jsonencode({
    Version = "2012-10-17"

    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.data.arn}/earthquakes/latest.geojson"
      }
    ]
  })
}

# ------------------------------------------------------------
# 5. Lambda ZIP Packages
# ------------------------------------------------------------

data "archive_file" "ingest" {
  type        = "zip"
  source_file = "${path.module}/lambda/ingest.py"
  output_path = "${path.module}/ingest.zip"
}

data "archive_file" "read" {
  type        = "zip"
  source_file = "${path.module}/lambda/read.py"
  output_path = "${path.module}/read.zip"
}

# ------------------------------------------------------------
# 6. CloudWatch Logs
# ------------------------------------------------------------

resource "aws_cloudwatch_log_group" "ingest" {
  name              = "/aws/lambda/${var.project_name}-ingest"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "read" {
  name              = "/aws/lambda/${var.project_name}-read"
  retention_in_days = 7
}

# ------------------------------------------------------------
# 7. Ingestion Lambda
# ------------------------------------------------------------

resource "aws_lambda_function" "ingest" {
  function_name = "${var.project_name}-ingest"

  filename         = data.archive_file.ingest.output_path
  source_code_hash = data.archive_file.ingest.output_base64sha256

  handler = "ingest.handler"
  runtime = "python3.12"

  role        = aws_iam_role.ingest.arn
  timeout     = 25
  memory_size = 256

  environment {
    variables = {
      DATA_BUCKET = aws_s3_bucket.data.bucket
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.ingest,
    aws_iam_role_policy_attachment.ingest_basic,
    aws_iam_role_policy.ingest_s3
  ]
}

# ------------------------------------------------------------
# 8. Read Lambda
# ------------------------------------------------------------

resource "aws_lambda_function" "read" {
  function_name = "${var.project_name}-read"

  filename         = data.archive_file.read.output_path
  source_code_hash = data.archive_file.read.output_base64sha256

  handler = "read.handler"
  runtime = "python3.12"

  role        = aws_iam_role.read.arn
  timeout     = 10
  memory_size = 128

  environment {
    variables = {
      DATA_BUCKET = aws_s3_bucket.data.bucket
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.read,
    aws_iam_role_policy_attachment.read_basic,
    aws_iam_role_policy.read_s3
  ]
}

# ------------------------------------------------------------
# 9. EventBridge Scheduler
# ------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "refresh" {
  name_prefix = "quakelens-refresh-"

  schedule_expression = "rate(15 minutes)"

  description = "Refresh public USGS earthquake feed every 15 minutes"
}

resource "aws_cloudwatch_event_target" "ingest" {
  rule      = aws_cloudwatch_event_rule.refresh.name
  target_id = "USGSRefresh"
  arn       = aws_lambda_function.ingest.arn
}

resource "aws_lambda_permission" "events" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest.function_name

  principal  = "events.amazonaws.com"
  source_arn = aws_cloudwatch_event_rule.refresh.arn
}

# ------------------------------------------------------------
# 10. API Gateway HTTP API
# ------------------------------------------------------------

resource "aws_apigatewayv2_api" "http" {
  name          = "${var.project_name}-data-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET"]
    allow_headers = ["Content-Type"]
    max_age       = 3600
  }
}

# ------------------------------------------------------------
# 11. API Gateway Integration
# ------------------------------------------------------------

resource "aws_apigatewayv2_integration" "read" {
  api_id = aws_apigatewayv2_api.http.id

  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.read.invoke_arn
  payload_format_version = "2.0"
}

# ------------------------------------------------------------
# 12. API Gateway Route
# ------------------------------------------------------------

resource "aws_apigatewayv2_route" "read" {
  api_id = aws_apigatewayv2_api.http.id

  route_key = "GET /earthquakes"

  target = "integrations/${aws_apigatewayv2_integration.read.id}"
}

# ------------------------------------------------------------
# 13. API Gateway Stage
# ------------------------------------------------------------

resource "aws_apigatewayv2_stage" "default" {
  api_id = aws_apigatewayv2_api.http.id

  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }
}

# ------------------------------------------------------------
# 14. API Gateway Lambda Permission
# ------------------------------------------------------------

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.read.function_name

  principal = "apigateway.amazonaws.com"

  source_arn = "${aws_apigatewayv2_api.http.execution_arn}/*/GET/earthquakes"
}

# ------------------------------------------------------------
# 15. Terraform Outputs
# ------------------------------------------------------------

output "bucket_name" {
  value = aws_s3_bucket.data.bucket
}

output "ingest_lambda_name" {
  value = aws_lambda_function.ingest.function_name
}

output "data_api_url" {
  value = "${aws_apigatewayv2_api.http.api_endpoint}/earthquakes"
}
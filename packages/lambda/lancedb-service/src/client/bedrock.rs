use aws_sdk_bedrockruntime::Client;
use aws_sdk_bedrockruntime::primitives::Blob;
use serde::{Deserialize, Serialize};
use tracing::info;

const EMBEDDING_DIMENSION: usize = 1024;

// ── Amazon Nova multimodal embedding ──────────────────────────────────────────

#[derive(Serialize)]
struct NovaEmbeddingRequest<'a> {
    #[serde(rename = "taskType")]
    task_type: &'a str,
    #[serde(rename = "singleEmbeddingParams")]
    single_embedding_params: NovaSingleEmbeddingParams<'a>,
}

#[derive(Serialize)]
struct NovaSingleEmbeddingParams<'a> {
    #[serde(rename = "embeddingPurpose")]
    embedding_purpose: &'a str,
    #[serde(rename = "embeddingDimension")]
    embedding_dimension: usize,
    text: NovaTextParam<'a>,
}

#[derive(Serialize)]
struct NovaTextParam<'a> {
    #[serde(rename = "truncationMode")]
    truncation_mode: &'a str,
    value: &'a str,
}

#[derive(Deserialize)]
struct NovaEmbeddingResponse {
    embeddings: Vec<NovaEmbeddingEntry>,
}

#[derive(Deserialize)]
struct NovaEmbeddingEntry {
    embedding: Vec<f32>,
}

// ── Amazon Titan text embedding v2 ────────────────────────────────────────────

#[derive(Serialize)]
struct TitanEmbeddingRequest<'a> {
    #[serde(rename = "inputText")]
    input_text: &'a str,
    dimensions: usize,
    normalize: bool,
}

#[derive(Deserialize)]
struct TitanEmbeddingResponse {
    embedding: Vec<f32>,
}

// ── Public API ─────────────────────────────────────────────────────────────────

pub async fn generate_embedding(client: &Client, text: &str) -> Result<Vec<f32>, aws_sdk_bedrockruntime::Error> {
    let value = text.trim();
    if value.is_empty() {
        return Ok(vec![0.0; EMBEDDING_DIMENSION]);
    }

    let model_id = std::env::var("BEDROCK_EMBEDDING_MODEL_ID")
        .unwrap_or_else(|_| "amazon.titan-embed-text-v2:0".to_string());

    info!("[generate_embedding] model={}, text_len={}", model_id, value.len());

    let is_nova = model_id.contains("nova");

    let body = if is_nova {
        serde_json::to_vec(&NovaEmbeddingRequest {
            task_type: "SINGLE_EMBEDDING",
            single_embedding_params: NovaSingleEmbeddingParams {
                embedding_purpose: "GENERIC_INDEX",
                embedding_dimension: EMBEDDING_DIMENSION,
                text: NovaTextParam {
                    truncation_mode: "END",
                    value,
                },
            },
        })
        .unwrap()
    } else {
        serde_json::to_vec(&TitanEmbeddingRequest {
            input_text: value,
            dimensions: EMBEDDING_DIMENSION,
            normalize: true,
        })
        .unwrap()
    };

    let response = client
        .invoke_model()
        .model_id(&model_id)
        .body(Blob::new(body))
        .content_type("application/json")
        .send()
        .await?;

    let response_bytes = response.body().as_ref();

    let embedding = if is_nova {
        let result: NovaEmbeddingResponse = serde_json::from_slice(response_bytes).unwrap();
        result.embeddings.into_iter().next().unwrap().embedding
    } else {
        let result: TitanEmbeddingResponse = serde_json::from_slice(response_bytes).unwrap();
        result.embedding
    };

    info!("[generate_embedding] Got embedding with {} dimensions", embedding.len());
    Ok(embedding)
}

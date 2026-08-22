CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS prompt_benchmark_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    baseline_prompt TEXT NOT NULL,
    optimized_prompt TEXT NOT NULL,
    sample_input TEXT NOT NULL,
    output_text TEXT NOT NULL,
    quality_score NUMERIC(5,2) NOT NULL,
    iterations_count INT NOT NULL,
    model_used VARCHAR(64) NOT NULL,
    prompt_embedding vector(768),
    output_embedding vector(768)
);

CREATE INDEX IF NOT EXISTS idx_prompt_embedding 
ON prompt_benchmark_runs USING ivfflat (prompt_embedding vector_cosine_ops) WITH (lists = 100);

CREATE OR REPLACE FUNCTION match_similar_prompts(
    query_embedding vector(768),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    id UUID,
    optimized_prompt TEXT,
    quality_score NUMERIC(5,2),
    similarity float
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.optimized_prompt,
        p.quality_score,
        1 - (p.prompt_embedding <=> query_embedding) AS similarity
    FROM prompt_benchmark_runs p
    WHERE 1 - (p.prompt_embedding <=> query_embedding) > match_threshold
    ORDER BY p.prompt_embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
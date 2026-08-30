CREATE OR REPLACE FUNCTION llegue_api.apply_tracking_event_realtime(
  p_route_id text,
  p_stop_id text,
  p_update_token text,
  p_idempotency_key uuid,
  p_event_type text,
  p_occurred_at timestamptz,
  p_payload jsonb,
  p_snapshot jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result_json jsonb;
  public_token text;
BEGIN
  SELECT pg_catalog.to_jsonb(result)
  INTO result_json
  FROM llegue_private.apply_tracking_event(
    p_route_id,
    p_stop_id,
    p_update_token,
    p_idempotency_key,
    p_event_type,
    p_occurred_at,
    p_payload,
    p_snapshot
  ) AS result;

  SELECT delivery.public_token::text
  INTO public_token
  FROM llegue_private.tracking_deliveries AS delivery
  WHERE delivery.route_id = p_route_id
    AND delivery.stop_id = p_stop_id;

  IF public_token IS NOT NULL AND result_json IS NOT NULL THEN
    BEGIN
      PERFORM realtime.send(
        pg_catalog.jsonb_build_object('snapshot', result_json->'snapshot'),
        'tracking.updated',
        'tracking:' || public_token,
        false
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN result_json;
END;
$$;

REVOKE ALL ON FUNCTION llegue_api.apply_tracking_event_realtime(
  text, text, text, uuid, text, timestamptz, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION llegue_api.apply_tracking_event_realtime(
  text, text, text, uuid, text, timestamptz, jsonb, jsonb
) TO service_role;

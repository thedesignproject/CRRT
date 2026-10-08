CREATE FUNCTION public.publish_widget_share_acceptance()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_share public.feedback_shares%ROWTYPE;
BEGIN
  SELECT s.* INTO v_share FROM public.feedback_shares s WHERE s.id=NEW.share_id;
  IF v_share.actor_user_id IS NULL OR v_share.created_by <> 'reviewer'
    OR v_share.scope_type <> 'selection' THEN RETURN NEW; END IF;
  INSERT INTO public.feedback_events(share_id,comment_id,actor_type,actor_id,event_type,payload)
    SELECT s.id,NEW.comment_id,'reviewer',v_share.actor_user_id::text,'comment.reviewed',
      jsonb_build_object('reviewStatus','accepted')
    FROM public.feedback_shares s
    WHERE s.project_id=v_share.project_id AND s.id<>NEW.share_id
      AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
      AND (s.scope_type='project' OR EXISTS (
        SELECT 1 FROM public.feedback_share_items i WHERE i.share_id=s.id AND i.comment_id=NEW.comment_id
      ));
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER publish_widget_share_acceptance AFTER INSERT ON public.feedback_share_items
  FOR EACH ROW EXECUTE FUNCTION public.publish_widget_share_acceptance();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.publish_widget_share_acceptance() FROM PUBLIC,anon,authenticated;

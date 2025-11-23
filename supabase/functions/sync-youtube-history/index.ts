import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY');
    if (!YOUTUBE_API_KEY) {
      throw new Error('YouTube API key not configured');
    }

    // Get user's Google OAuth token from session
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const accessToken = sessionData.session?.provider_token;

    if (!accessToken) {
      throw new Error('No YouTube access token found. Please reconnect with Google.');
    }

    // Fetch watch history from YouTube API
    const historyUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=HL&maxResults=50&key=${YOUTUBE_API_KEY}`;
    
    const historyResponse = await fetch(historyUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!historyResponse.ok) {
      const error = await historyResponse.text();
      console.error('YouTube API error:', error);
      throw new Error('Failed to fetch YouTube history');
    }

    const historyData = await historyResponse.json();
    const videos = historyData.items || [];

    // Fetch video details
    const videoIds = videos.map((item: any) => item.snippet.resourceId.videoId).join(',');
    
    if (videoIds) {
      const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
      const videoDetailsResponse = await fetch(videoDetailsUrl);
      const videoDetailsData = await videoDetailsResponse.json();

      // Parse and store videos
      const videoRecords = videoDetailsData.items?.map((video: any) => {
        // Parse ISO 8601 duration (PT#H#M#S)
        const duration = video.contentDetails.duration;
        const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        const hours = parseInt(match?.[1] || '0');
        const minutes = parseInt(match?.[2] || '0');
        const seconds = parseInt(match?.[3] || '0');
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;

        return {
          user_id: user.id,
          video_id: video.id,
          title: video.snippet.title,
          channel: video.snippet.channelTitle,
          duration: totalSeconds,
          category_id: video.snippet.categoryId,
          watched_at: new Date().toISOString(),
        };
      });

      // Bulk insert videos (ignore duplicates)
      if (videoRecords && videoRecords.length > 0) {
        const { error: insertError } = await supabaseClient
          .from('videos')
          .upsert(videoRecords, { 
            onConflict: 'user_id,video_id,watched_at',
            ignoreDuplicates: true 
          });

        if (insertError) {
          console.error('Error inserting videos:', insertError);
          throw insertError;
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        videosProcessed: videos.length 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error('Error in sync-youtube-history:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
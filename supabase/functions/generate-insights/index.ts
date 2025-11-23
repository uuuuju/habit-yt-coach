import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Credentials': 'true',
};

serve(async (req) => {
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    // Fetch recent watch history
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: videos, error: videosError } = await supabaseClient
      .from('videos')
      .select('*')
      .eq('user_id', user.id)
      .gte('watched_at', sevenDaysAgo.toISOString())
      .order('watched_at', { ascending: false });

    if (videosError) throw videosError;

    if (!videos || videos.length === 0) {
      throw new Error('No watch history found. Please sync your YouTube data first.');
    }

    // Calculate statistics
    const totalWatchTime = videos.reduce((sum, v) => sum + (v.duration || 0), 0);
    const avgVideoLength = totalWatchTime / videos.length;
    
    // Categorize by time of day
    const lateNightVideos = videos.filter(v => {
      const hour = new Date(v.watched_at).getHours();
      return hour >= 23 || hour < 6;
    });

    // Group by channel
    const channelCounts: Record<string, number> = {};
    videos.forEach(v => {
      channelCounts[v.channel] = (channelCounts[v.channel] || 0) + 1;
    });
    const topChannels = Object.entries(channelCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([channel, count]) => ({ channel, count }));

    // Prepare data for AI
    const analyticsData = {
      totalVideos: videos.length,
      totalWatchTime: Math.floor(totalWatchTime / 60), // minutes
      avgVideoLength: Math.floor(avgVideoLength / 60), // minutes
      lateNightViewingPercentage: Math.round((lateNightVideos.length / videos.length) * 100),
      topChannels: topChannels,
      period: '7 days'
    };

    // Generate insights using AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a YouTube habit analyzer. Generate 3-5 personalized insights based on viewing data. Each insight should be concise, actionable, and focused on building healthier habits.'
          },
          {
            role: 'user',
            content: `Analyze this YouTube viewing data and provide insights:\n${JSON.stringify(analyticsData, null, 2)}`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const error = await aiResponse.text();
      console.error('AI API error:', error);
      throw new Error('Failed to generate insights');
    }

    const aiData = await aiResponse.json();
    const insightsText = aiData.choices[0].message.content;

    // Parse insights and store them
    const insightRecords = [
      {
        user_id: user.id,
        insight_type: 'pattern',
        title: 'Weekly Viewing Pattern',
        description: insightsText.substring(0, 500),
        data: analyticsData,
      },
      {
        user_id: user.id,
        insight_type: 'time',
        title: 'Late-Night Viewing Analysis',
        description: `You watched ${analyticsData.lateNightViewingPercentage}% of your videos late at night (after 11 PM). Consider setting a viewing cutoff time to improve sleep quality.`,
        data: { lateNightPercentage: analyticsData.lateNightViewingPercentage },
      },
      {
        user_id: user.id,
        insight_type: 'recommendation',
        title: 'Personalized Recommendations',
        description: insightsText.substring(500, 1000) || 'Based on your viewing patterns, we recommend setting daily limits and exploring more educational content.',
        data: { topChannels },
      }
    ];

    const { error: insertError } = await supabaseClient
      .from('insights')
      .insert(insightRecords);

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ 
        success: true,
        insights: insightRecords.length 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error('Error in generate-insights:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});

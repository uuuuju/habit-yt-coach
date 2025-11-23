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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    // Fetch recent watch history
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: videos, error: videosError } = await supabaseClient
      .from('videos')
      .select('*')
      .eq('user_id', user.id)
      .gte('watched_at', sevenDaysAgo.toISOString());

    if (videosError) throw videosError;

    if (!videos || videos.length === 0) {
      throw new Error('No watch history found. Please sync your YouTube data first.');
    }

    // Calculate patterns
    const totalWatchTime = videos.reduce((sum, v) => sum + (v.duration || 0), 0);
    const shortsCount = videos.filter(v => (v.duration || 0) < 60).length;
    const shortsPercentage = Math.round((shortsCount / videos.length) * 100);

    // Generate habits using AI
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
            content: 'You are a habit coach. Generate 3-5 micro-habits to help users build healthier YouTube viewing patterns. Each habit should be specific, measurable, and achievable. Return ONLY a JSON array with objects containing: title (string), priority (low/medium/high), category (string), and description (string).'
          },
          {
            role: 'user',
            content: `User watches ${Math.floor(totalWatchTime / 3600)} hours per week, ${shortsPercentage}% are Shorts. Generate personalized micro-habits.`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const error = await aiResponse.text();
      console.error('AI API error:', error);
      throw new Error('Failed to generate habits');
    }

    const aiData = await aiResponse.json();
    const habitsText = aiData.choices[0].message.content;

    // Try to parse JSON, fallback to default habits if fails
    let habits;
    try {
      // Remove markdown code blocks if present
      const cleanText = habitsText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      habits = JSON.parse(cleanText);
    } catch (parseError) {
      console.error('Failed to parse AI response, using defaults:', parseError);
      habits = [
        {
          title: "Limit YouTube Shorts to 15 minutes today",
          priority: "high",
          category: "Content Control",
          description: "Short-form content can be addictive. Set a timer and stick to your limit."
        },
        {
          title: "Watch 1 educational video before entertainment",
          priority: "medium",
          category: "Learning",
          description: "Balance your content by starting with something educational."
        },
        {
          title: "No YouTube after 10 PM",
          priority: "high",
          category: "Sleep Hygiene",
          description: "Better sleep starts with evening screen time limits."
        }
      ];
    }

    const today = new Date().toISOString().split('T')[0];

    // Deactivate old habits
    await supabaseClient
      .from('habits')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .lt('date', today);

    // Insert new habits
    const habitRecords = habits.map((habit: any) => ({
      user_id: user.id,
      title: habit.title,
      description: habit.description,
      priority: habit.priority,
      category: habit.category,
      date: today,
      is_active: true,
    }));

    const { error: insertError } = await supabaseClient
      .from('habits')
      .insert(habitRecords);

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ 
        success: true,
        habits: habitRecords.length 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error('Error in generate-habits:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
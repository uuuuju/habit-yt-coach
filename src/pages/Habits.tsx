import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw, Target, Flame } from "lucide-react";
import { toast } from "sonner";

interface Habit {
  id: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high';
  category: string | null;
  date: string;
  is_active: boolean;
  completions?: Array<{ id: string }>;
}

const Habits = () => {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    loadHabits();
    calculateStreak();
  }, []);

  const loadHabits = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('habits')
        .select(`
          *,
          habit_completions!habit_id (id)
        `)
        .eq('user_id', user.id)
        .eq('date', today)
        .eq('is_active', true);

      if (error) throw error;
      setHabits((data as any) || []);
    } catch (error) {
      console.error('Error loading habits:', error);
      toast.error('Failed to load habits');
    } finally {
      setLoading(false);
    }
  };

  const calculateStreak = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Calculate consecutive days with completed habits
      const { data, error } = await supabase
        .from('habit_completions')
        .select('completed_at')
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false });

      if (error) throw error;

      // Simple streak calculation (can be improved)
      let currentStreak = 0;
      if (data && data.length > 0) {
        const today = new Date().toDateString();
        if (new Date(data[0].completed_at).toDateString() === today) {
          currentStreak = 1;
        }
      }
      
      setStreak(currentStreak);
    } catch (error) {
      console.error('Error calculating streak:', error);
    }
  };

  const generateHabits = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-habits');
      
      if (error) throw error;
      
      toast.success('New habits generated!');
      await loadHabits();
    } catch (error: any) {
      console.error('Error generating habits:', error);
      toast.error(error.message || 'Failed to generate habits');
    } finally {
      setGenerating(false);
    }
  };

  const toggleHabitCompletion = async (habitId: string, isCompleted: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (isCompleted) {
        // Remove completion
        await supabase
          .from('habit_completions')
          .delete()
          .eq('habit_id', habitId)
          .eq('user_id', user.id);
      } else {
        // Add completion
        await supabase
          .from('habit_completions')
          .insert({ habit_id: habitId, user_id: user.id });
      }

      await loadHabits();
      await calculateStreak();
      toast.success(isCompleted ? 'Habit unmarked' : 'Great job! Habit completed!');
    } catch (error) {
      console.error('Error toggling habit:', error);
      toast.error('Failed to update habit');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Daily Habits</h1>
          <p className="text-muted-foreground">Build healthier YouTube viewing patterns</p>
        </div>
        <Button onClick={generateHabits} disabled={generating}>
          <RefreshCw className={`mr-2 h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Generating...' : 'Generate New Habits'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Your Streak</CardTitle>
              <CardDescription>Keep it going!</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Flame className="h-8 w-8 text-primary" />
              <span className="text-3xl font-bold">{streak}</span>
            </div>
          </div>
        </CardHeader>
      </Card>

      {habits.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Target className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No habits for today</h3>
            <p className="text-muted-foreground text-center mb-4">
              Click "Generate New Habits" to get AI-powered habit suggestions
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {habits.map((habit) => {
            const isCompleted = habit.completions && habit.completions.length > 0;
            return (
              <Card key={habit.id}>
                <CardContent className="flex items-start gap-4 p-6">
                  <Checkbox
                    checked={isCompleted}
                    onCheckedChange={() => toggleHabitCompletion(habit.id, isCompleted)}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-semibold ${isCompleted ? 'line-through text-muted-foreground' : ''}`}>
                        {habit.title}
                      </h3>
                      <Badge variant={getPriorityColor(habit.priority)}>
                        {habit.priority}
                      </Badge>
                      {habit.category && (
                        <Badge variant="outline">{habit.category}</Badge>
                      )}
                    </div>
                    {habit.description && (
                      <p className={`text-sm ${isCompleted ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {habit.description}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Habits;
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { Clock, Video, TrendingUp, Calendar } from "lucide-react";

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    todayWatchTime: 0,
    weeklyWatchTime: 0,
    totalVideos: 0,
    avgVideoLength: 0,
  });
  const [weeklyData, setWeeklyData] = useState<Array<{ day: string; time: number }>>([]);
  const [contentTypeData, setContentTypeData] = useState<Array<{ name: string; value: number }>>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch videos from last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: videos } = await supabase
        .from('videos')
        .select('*')
        .eq('user_id', user.id)
        .gte('watched_at', sevenDaysAgo.toISOString());

      if (videos && videos.length > 0) {
        const today = new Date().toDateString();
        const todayVideos = videos.filter(v => new Date(v.watched_at).toDateString() === today);
        
        setStats({
          todayWatchTime: todayVideos.reduce((sum, v) => sum + (v.duration || 0), 0),
          weeklyWatchTime: videos.reduce((sum, v) => sum + (v.duration || 0), 0),
          totalVideos: videos.length,
          avgVideoLength: videos.length > 0 
            ? videos.reduce((sum, v) => sum + (v.duration || 0), 0) / videos.length 
            : 0,
        });

        // Calculate weekly data by day
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dailyStats = new Map<number, number>();
        
        videos.forEach(video => {
          const date = new Date(video.watched_at);
          const dayIndex = date.getDay();
          const currentTime = dailyStats.get(dayIndex) || 0;
          dailyStats.set(dayIndex, currentTime + (video.duration || 0));
        });

        const weeklyChartData = Array.from({ length: 7 }, (_, i) => {
          const dayIndex = (new Date().getDay() - 6 + i + 7) % 7;
          return {
            day: dayNames[dayIndex],
            time: Math.round((dailyStats.get(dayIndex) || 0) / 60) // Convert to minutes
          };
        });
        setWeeklyData(weeklyChartData);

        // Calculate content distribution based on video duration
        const shortVideos = videos.filter(v => (v.duration || 0) < 60).reduce((sum, v) => sum + (v.duration || 0), 0);
        const mediumVideos = videos.filter(v => (v.duration || 0) >= 60 && (v.duration || 0) < 600).reduce((sum, v) => sum + (v.duration || 0), 0);
        const longVideos = videos.filter(v => (v.duration || 0) >= 600).reduce((sum, v) => sum + (v.duration || 0), 0);
        
        const totalDuration = shortVideos + mediumVideos + longVideos;
        if (totalDuration > 0) {
          setContentTypeData([
            { name: 'Shorts (<1m)', value: Math.round((shortVideos / totalDuration) * 100) },
            { name: 'Medium (1-10m)', value: Math.round((mediumVideos / totalDuration) * 100) },
            { name: 'Long (>10m)', value: Math.round((longVideos / totalDuration) * 100) },
          ]);
        }
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };


  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Your YouTube viewing insights at a glance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Watch Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTime(stats.todayWatchTime)}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Weekly Watch Time</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTime(stats.weeklyWatchTime)}</div>
            <p className="text-xs text-muted-foreground">Last 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Videos Watched</CardTitle>
            <Video className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalVideos}</div>
            <p className="text-xs text-muted-foreground">This week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Video Length</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTime(Math.floor(stats.avgVideoLength))}</div>
            <p className="text-xs text-muted-foreground">Average duration</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Weekly Watch Time</CardTitle>
            <CardDescription>Your daily viewing patterns</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)'
                  }} 
                />
                <Bar dataKey="time" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Content Distribution</CardTitle>
            <CardDescription>What you're watching</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={contentTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="hsl(var(--primary))"
                  dataKey="value"
                >
                  {contentTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)'
                  }} 
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
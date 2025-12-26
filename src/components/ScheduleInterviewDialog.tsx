import { useState, useEffect } from 'react';
import { CalendarIcon, Clock, Loader2, Video, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, addDays, addMinutes, isBefore, isAfter, parseISO } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface Application {
  id: string;
  candidate: {
    full_name: string;
    email: string;
  };
  job: {
    title: string;
  };
}

interface BusySlot {
  start: string;
  end: string;
}

export const ScheduleInterviewDialog = () => {
  const [open, setOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [duration, setDuration] = useState<string>('60');
  const [interviewType, setInterviewType] = useState<string>('Technical');
  const [createMeetLink, setCreateMeetLink] = useState(true);
  const [busySlots, setBusySlots] = useState<BusySlot[]>([]);
  const [loadingBusy, setLoadingBusy] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [checkingCalendar, setCheckingCalendar] = useState(true);
  const queryClient = useQueryClient();

  // Check Google Calendar connection
  useEffect(() => {
    if (open) {
      checkCalendarConnection();
    }
  }, [open]);

  // Fetch busy slots when date changes
  useEffect(() => {
    if (selectedDate && calendarConnected) {
      fetchBusySlots(selectedDate);
    }
  }, [selectedDate, calendarConnected]);

  const checkCalendarConnection = async () => {
    setCheckingCalendar(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: { action: 'check-connection' },
      });
      if (!error && data) {
        setCalendarConnected(data.connected);
      }
    } catch (error) {
      console.error('Calendar check error:', error);
    } finally {
      setCheckingCalendar(false);
    }
  };

  const fetchBusySlots = async (date: Date) => {
    setLoadingBusy(true);
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error } = await supabase.functions.invoke('google-calendar', {
        body: {
          action: 'get-free-busy',
          timeMin: startOfDay.toISOString(),
          timeMax: endOfDay.toISOString(),
        },
      });

      if (!error && data?.busySlots) {
        setBusySlots(data.busySlots);
      }
    } catch (error) {
      console.error('Failed to fetch busy slots:', error);
    } finally {
      setLoadingBusy(false);
    }
  };

  // Generate time slots
  const timeSlots = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
    '15:00', '15:30', '16:00', '16:30', '17:00'
  ];

  // Check if a time slot conflicts with busy periods
  const isSlotBusy = (timeSlot: string): boolean => {
    if (!selectedDate || busySlots.length === 0) return false;
    
    const [hours, minutes] = timeSlot.split(':').map(Number);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(hours, minutes, 0, 0);
    const slotEnd = addMinutes(slotStart, parseInt(duration));

    return busySlots.some(busy => {
      const busyStart = parseISO(busy.start);
      const busyEnd = parseISO(busy.end);
      // Check for overlap
      return (isBefore(slotStart, busyEnd) && isAfter(slotEnd, busyStart));
    });
  };

  // Find first available slot
  const findFirstAvailable = (): string | null => {
    for (const slot of timeSlots) {
      if (!isSlotBusy(slot)) {
        return slot;
      }
    }
    return null;
  };

  // Auto-select first available when date changes
  useEffect(() => {
    if (selectedDate && !loadingBusy) {
      const firstAvailable = findFirstAvailable();
      if (firstAvailable && !selectedTime) {
        setSelectedTime(firstAvailable);
      }
    }
  }, [selectedDate, loadingBusy, busySlots]);

  // Fetch applications that can be scheduled for interview
  const { data: applications, isLoading: loadingApps } = useQuery({
    queryKey: ['schedulable-applications'],
    queryFn: async (): Promise<Application[]> => {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          id,
          status,
          candidate_id,
          job_id,
          candidates:candidate_id(full_name, email),
          jobs:job_id(title)
        `)
        .in('status', ['applied', 'screening']);

      if (error) {
        console.error('Error fetching schedulable applications:', error);
        throw error;
      }

      console.log('Fetched applications for scheduling:', data);

      return (data || []).map((app: any) => ({
        id: app.id,
        candidate: {
          full_name: app.candidates?.full_name || 'Unknown',
          email: app.candidates?.email || ''
        },
        job: {
          title: app.jobs?.title || 'Unknown Position'
        }
      }));
    },
    enabled: open,
  });

  const scheduleInterview = useMutation({
    mutationFn: async () => {
      if (!selectedApplication || !selectedDate || !selectedTime) {
        throw new Error('Please select a candidate, date and time');
      }

      const app = applications?.find(a => a.id === selectedApplication);
      if (!app) throw new Error('Application not found');

      // Combine date and time
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const scheduledAt = new Date(selectedDate);
      scheduledAt.setHours(hours, minutes, 0, 0);
      
      const endTime = addMinutes(scheduledAt, parseInt(duration));

      let meetingUrl = null;
      let calendarEventId = null;

      // Create Google Calendar event with Meet if connected
      if (calendarConnected && createMeetLink) {
        try {
          const { data: calendarData, error: calendarError } = await supabase.functions.invoke('google-calendar', {
            body: {
              action: 'create-event',
              event: {
                summary: `Interview: ${app.candidate.full_name} - ${app.job.title}`,
                description: `${interviewType} interview with ${app.candidate.full_name} for ${app.job.title} position.`,
                startTime: scheduledAt.toISOString(),
                endTime: endTime.toISOString(),
                attendees: [app.candidate.email],
                createMeet: true,
              },
            },
          });

          if (!calendarError && calendarData) {
            meetingUrl = calendarData.meetLink;
            calendarEventId = calendarData.eventId;
          }
        } catch (error) {
          console.error('Failed to create calendar event:', error);
          toast.error('Calendar event creation failed, but continuing with scheduling');
        }
      }

      const { data, error } = await supabase.functions.invoke('schedule-interview', {
        body: {
          applicationId: selectedApplication,
          scheduledAt: scheduledAt.toISOString(),
          durationMinutes: parseInt(duration),
          interviewType,
          candidateEmail: app.candidate.email,
          candidateName: app.candidate.full_name,
          jobTitle: app.job.title,
          meetingUrl,
          meetingId: calendarEventId,
        }
      });

      if (error) throw error;
      return { ...data, meetingUrl };
    },
    onSuccess: (data) => {
      if (data?.meetingUrl) {
        toast.success('Interview scheduled with Google Meet link!');
      } else {
        toast.success(data?.message || 'Interview scheduled successfully');
      }
      setOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['interviews'] });
      queryClient.invalidateQueries({ queryKey: ['schedulable-applications'] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to schedule interview');
    },
  });

  const resetForm = () => {
    setSelectedApplication('');
    setSelectedDate(undefined);
    setSelectedTime('');
    setDuration('60');
    setInterviewType('Technical');
    setBusySlots([]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Video className="w-4 h-4 mr-2" />
          New Interview
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Schedule Interview</DialogTitle>
          <DialogDescription>
            Select a candidate and schedule their interview
            {calendarConnected && (
              <Badge variant="secondary" className="ml-2 bg-green-500/10 text-green-600 border-green-500/20">
                <CheckCircle className="w-3 h-3 mr-1" />
                Calendar Connected
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Candidate Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Candidate</label>
            {loadingApps ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading candidates...
              </div>
            ) : (
              <Select value={selectedApplication} onValueChange={setSelectedApplication}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a candidate" />
                </SelectTrigger>
                <SelectContent>
                  {applications?.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No candidates available for scheduling
                    </div>
                  ) : (
                    applications?.map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {app.candidate.full_name} - {app.job.title}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Date Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setSelectedTime('');
                  }}
                  disabled={(date) => date < new Date() || date.getDay() === 0 || date.getDay() === 6}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Selection with availability */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Time</label>
              {loadingBusy && (
                <span className="text-xs text-muted-foreground flex items-center">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Checking availability...
                </span>
              )}
            </div>
            <Select 
              value={selectedTime} 
              onValueChange={setSelectedTime}
              disabled={!selectedDate}
            >
              <SelectTrigger>
                <SelectValue placeholder={selectedDate ? "Select a time" : "Select a date first"} />
              </SelectTrigger>
              <SelectContent>
                {timeSlots.map((time) => {
                  const isBusy = isSlotBusy(time);
                  return (
                    <SelectItem 
                      key={time} 
                      value={time}
                      disabled={isBusy}
                      className={isBusy ? "text-muted-foreground" : ""}
                    >
                      <div className="flex items-center gap-2">
                        {time}
                        {calendarConnected && (
                          isBusy ? (
                            <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500 border-red-500/20">
                              Busy
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-500 border-green-500/20">
                              Available
                            </Badge>
                          )
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {calendarConnected && selectedDate && !loadingBusy && (
              <p className="text-xs text-muted-foreground">
                {busySlots.length > 0 
                  ? `${busySlots.length} busy period(s) on this day`
                  : 'No conflicts on this day'
                }
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Duration */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Duration</label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 minutes</SelectItem>
                  <SelectItem value="45">45 minutes</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Interview Type */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Interview Type</label>
              <Select value={interviewType} onValueChange={setInterviewType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HR Screen">HR Screen</SelectItem>
                  <SelectItem value="Technical">Technical</SelectItem>
                  <SelectItem value="Behavioral">Behavioral</SelectItem>
                  <SelectItem value="Final">Final Round</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Google Meet Toggle */}
          {calendarConnected && (
            <div className="flex items-center justify-between rounded-lg border border-border p-4 bg-secondary/30">
              <div className="space-y-0.5">
                <Label htmlFor="create-meet" className="text-sm font-medium">
                  Create Google Meet Link
                </Label>
                <p className="text-xs text-muted-foreground">
                  Automatically generate a video meeting link
                </p>
              </div>
              <Switch
                id="create-meet"
                checked={createMeetLink}
                onCheckedChange={setCreateMeetLink}
              />
            </div>
          )}

          {!calendarConnected && !checkingCalendar && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-600">
                Connect Google Calendar in Settings to see availability and auto-create Meet links.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => scheduleInterview.mutate()}
            disabled={scheduleInterview.isPending || !selectedApplication || !selectedDate || !selectedTime}
          >
            {scheduleInterview.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Scheduling...
              </>
            ) : (
              <>
                <Clock className="w-4 h-4 mr-2" />
                Schedule Interview
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

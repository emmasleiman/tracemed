import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Users, FileText, Search, Loader2, Clock, CheckCircle, Bell } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import PatientHistory from "@/components/PatientHistory";
import DashboardHeader from "@/components/DashboardHeader";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LocationInconsistencyAlerts } from "@/components/LocationInconsistencyAlerts";
import AdminNotifications from "@/components/AdminNotifications";

type Patient = {
  id: string;
  patient_id: string;
  culture_required: boolean;
  status: string;
  registration_date: string;
  discharge_date: string | null;
};

type LabResult = {
  id: string;
  patient_id: string;
  sample_id: string;
  result: string | null;
  collection_date: string;
  processed_by: string | null;
  processed_date: string | null;
  notes: string | null;
};

type PatientLabResult = {
  patient_uuid: string;
  patient_id: string;
  culture_required: boolean;
  status: string;
  registration_date: string;
  discharge_date: string | null;
  lab_result_id: string | null;
  sample_id: string | null;
  result: string | null;
  collection_date: string | null;
  processed_by: string | null;
  processed_date: string | null;
  notes: string | null;
};

type LabTest = {
  id: string;
  type: string;
  requestedOn: string;
  status: string;
  resistanceResult: string | null;
};

type PatientData = {
  id: string;
  labs: LabTest[];
};

type WardScanLog = {
  id: string;
  patient_id: string;
  ward: string;
  scanned_at: string;
  scanned_by: string
};

type CriticalCaseWithLocation = LabResult & { 
  patients: Pick<Patient, 'patient_id'>;
  lastLocation?: string | null;
  lastScanTime?: string | null;
  notes?: string | null;
};

type PatientLabSample = {
  id: string;
  sample_id: string;
  collection_date: string;
  patient_id: string;
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [patientIdFilter, setPatientIdFilter] = useState("");
  const [dischargePatientId, setDischargePatientId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [isPatientLogsOpen, setIsPatientLogsOpen] = useState(false);
  const [selectedPatientForLogs, setSelectedPatientForLogs] = useState<string | null>(null);
  const [patientScanLogs, setPatientScanLogs] = useState<WardScanLog[]>([]);
  const [isLoadingPatientLogs, setIsLoadingPatientLogs] = useState(false);
  const [criticalCasesLocations, setCriticalCasesLocations] = useState<Record<string, string>>({});
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showDischargeConfirm, setShowDischargeConfirm] = useState(false);
  
  const [patientData, setPatientData] = useState<PatientData | null>(null);
  const [selectedLabTest, setSelectedLabTest] = useState<LabTest | null>(null);
  const [resistance, setResistance] = useState<string | null>(null);
  const [patientIdInput, setPatientIdInput] = useState("");
  const [isLoadingPatientSamples, setIsLoadingPatientSamples] = useState(false);
  const [patientLabSamples, setPatientLabSamples] = useState<PatientLabSample[]>([]);
  const [selectedSample, setSelectedSample] = useState<PatientLabSample | null>(null);
  const [selectedResult, setSelectedResult] = useState<"positive" | "negative" | null>(null);
  const [showResultConfirm, setShowResultConfirm] = useState(false);
  const [isPatientHistoryOpen, setIsPatientHistoryOpen] = useState(false);
  const [selectedPatientForHistory, setSelectedPatientForHistory] = useState<string | null>(null);
  
  const form = useForm({
    defaultValues: {
      patientId: "",
    }
  });

  const {
    data: patients = [],
    isLoading: isLoadingPatients,
    refetch: refetchPatients,
  } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("*") as { data: Patient[] | null, error: any };
      
      if (error) throw error;
      return data || [];
    },
  });

  const {
    data: labResults = [],
    isLoading: isLoadingLabResults,
    refetch: refetchLabResults,
  } = useQuery({
    queryKey: ["lab_results"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lab_results")
        .select("*, patients!inner(patient_id)") as { data: (LabResult & { patients: Pick<Patient, 'patient_id'> })[] | null, error: any };
      
      if (error) throw error;
      return data || [];
    },
  });

  const {
    data: wardScanLogs = [],
    isLoading: isLoadingWardScanLogs,
  } = useQuery({
    queryKey: ["ward_scan_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ward_scan_logs")
        .select("*") as { data: WardScanLog[] | null, error: any };
      
      if (error) throw error;
      return data || [];
    },
  });

  const isPatientInIsolation = (patientId: string): boolean => {
    if (!wardScanLogs.length) return false;
    
    const patientLogs = wardScanLogs.filter(log => {
      try {
        const logData = typeof log.patient_id === 'string' ? JSON.parse(log.patient_id) : log.patient_id;
        return logData.patientId === patientId;
      } catch (e) {
        return false;
      }
    });
    
    const sortedLogs = [...patientLogs].sort((a, b) => 
      new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime()
    );
    
    return sortedLogs.length > 0 && sortedLogs[0].ward === 'isolation_room';
  };

  const filteredLabResults = labResults.map(result => {
    const patientId = result.patients?.patient_id;
    const inIsolation = patientId ? isPatientInIsolation(patientId) : false;
    
    return {
      ...result,
      isInIsolation: inIsolation
    };
  });

  const criticalCases = filteredLabResults.filter(result => 
    result.result === "positive" && 
    !result.isInIsolation &&
    result.notes !== "Patient moved to isolation room. Previously marked as positive."
  );

  const resolvedCases = filteredLabResults.filter(result => 
    result.result === "resolved" || 
    result.isInIsolation ||
    (result.result === "positive" && result.notes === "Patient moved to isolation room. Previously marked as positive.")
  );
  
  const extractPatientId = (patientIdStr: string): string => {
    try {
      const parsed = JSON.parse(patientIdStr);
      return parsed.patientId || patientIdStr;
    } catch (e) {
      return patientIdStr;
    }
  };

  const getLastPatientLocation = (patientId: string): { ward: string | null, scannedAt: string | null } => {
    const patientLogs = wardScanLogs.filter(log => {
      const extractedId = extractPatientId(log.patient_id);
      return extractedId === patientId;
    });
    
    if (patientLogs.length === 0) {
      return { ward: null, scannedAt: null };
    }
    
    const sortedLogs = [...patientLogs].sort((a, b) => 
      new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime()
    );
    
    return { 
      ward: sortedLogs[0].ward,
      scannedAt: sortedLogs[0].scanned_at
    };
  };

  const enhancedCriticalCases: CriticalCaseWithLocation[] = criticalCases.map(result => {
    const patientId = result.patients?.patient_id;
    const { ward, scannedAt } = patientId ? getLastPatientLocation(patientId) : { ward: null, scannedAt: null };
    
    return {
      ...result,
      lastLocation: ward,
      lastScanTime: scannedAt
    };
  });

  const enhancedResolvedCases: CriticalCaseWithLocation[] = resolvedCases.map(result => {
    const patientId = result.patients?.patient_id;
    const { ward, scannedAt } = patientId ? getLastPatientLocation(patientId) : { ward: null, scannedAt: null };
    
    return {
      ...result,
      lastLocation: ward,
      lastScanTime: scannedAt
    };
  });

  const pendingCases = labResults.filter(result => result.result === null);
  
  const enhancedPendingCases = pendingCases.map(result => {
    const patientId = result.patients?.patient_id;
    const { ward, scannedAt } = patientId ? getLastPatientLocation(patientId) : { ward: null, scannedAt: null };
    
    return {
      ...result,
      lastLocation: ward,
      lastScanTime: scannedAt
    };
  });

  const filteredPatients = patientIdFilter
    ? patients.filter(patient => 
        patient.patient_id.toLowerCase().includes(patientIdFilter.toLowerCase())
      )
    : patients;

  const fetchPatientLabResults = async (patientId: string) => {
    const { data, error } = await supabase
      .from('patient_lab_results')
      .select('*')
      .eq('patient_id', patientId) as { data: PatientLabResult[] | null, error: any };
    
    if (error) throw error;
    return data || [];
  };

  const fetchPatientScanLogs = async (patientId: string) => {
    try {
      console.log('Fetching logs for patient ID:', patientId);
      
      const { data, error } = await supabase
        .from('ward_scan_logs')
        .select('*') as { data: WardScanLog[] | null, error: any };
      
      if (error) {
        console.error('Error fetching patient scan logs:', error);
        toast({
          variant: "destructive",
          title: "Failed to Load",
          description: "Could not load patient scan logs.",
        });
        return [];
      }
      
      if (!data || data.length === 0) {
        console.log('No scan logs found');
        return [];
      }
      
      const filteredLogs = data.filter(log => {
        const extractedId = extractPatientId(log.patient_id);
        return extractedId === patientId;
      });
      
      console.log('Patient scan logs fetched:', data);
      console.log('Filtered logs for patient:', filteredLogs);
      
      return filteredLogs;
    } catch (error) {
      console.error('Error fetching patient scan logs:', error);
      return [];
    }
  };

  const handleViewPatientLogs = async (patientId: string) => {
    console.log('View history requested for patient ID:', patientId);
    setSelectedPatientForHistory(patientId);
    setIsPatientHistoryOpen(true);
  };

  const { mutate: searchPatient } = useMutation({
    mutationFn: async (values: { patientId: string }) => {
      const patientId = values.patientId.trim();
      if (!patientId) {
        throw new Error('Patient ID is required');
      }

      return await fetchPatientLabResults(patientId);
    },
    onSuccess: (data) => {
      if (data.length > 0) {
        setSelectedPatientId(form.getValues().patientId);
        
        const labTests = data.map(item => ({
          id: item.lab_result_id || '',
          type: item.sample_id ? item.sample_id.split('-')[0] : 'Unknown',
          requestedOn: item.collection_date ? new Date(item.collection_date).toISOString().split('T')[0] : '',
          status: item.result === null ? 'pending' : 'completed',
          resistanceResult: item.result
        })).filter(lab => lab.id);
        
        setPatientData({
          id: form.getValues().patientId,
          labs: labTests
        });
        
        toast({
          title: "Patient Found",
          description: `Found ${labTests.length} lab cultures for patient ${form.getValues().patientId}`,
        });
      } else {
        setPatientData(null);
        toast({
          variant: "destructive",
          title: "Patient Not Found",
          description: "No lab cultures found for the provided patient ID",
        });
      }
    },
    onError: (error) => {
      console.error("Error searching for patient:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to search for patient",
      });
    }
  });

  const handleSearch = (values: { patientId: string }) => {
    searchPatient(values);
  };

  const { mutate: submitLabResult } = useMutation({
    mutationFn: async ({ labId, result }: { labId: string, result: string }) => {
      const { data, error } = await supabase
        .from('lab_results')
        .update({
          result: result,
          processed_by: 'Admin',
          processed_date: new Date().toISOString()
        })
        .eq('id', labId)
        .select() as { data: any, error: any };
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Lab Result Submitted",
        description: `Recorded ${resistance} result for sample`,
      });
      
      if (patientData) {
        const updatedLabs = patientData.labs.map((lab: LabTest) => 
          lab.id === selectedLabTest?.id 
            ? { ...lab, status: "completed", resistanceResult: resistance } 
            : lab
        );
        
        setPatientData({
          ...patientData,
          labs: updatedLabs
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['patientLabResults', selectedPatientId] });
      queryClient.invalidateQueries({ queryKey: ['lab_results'] });
      
      setSelectedLabTest(null);
      setResistance(null);
    },
    onError: (error) => {
      console.error("Error submitting lab result:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to submit lab result",
      });
    }
  });

  const handleSelectLabTest = (lab: LabTest, resistanceStatus: "positive" | "negative") => {
    setSelectedLabTest(lab);
    setResistance(resistanceStatus);
    
    submitLabResult({
      labId: lab.id,
      result: resistanceStatus
    });
  };

  const handleLogout = () => {
    navigate("/");
  };

  const handleFindPatientSamples = async () => {
    if (!patientIdInput.trim()) {
      toast({
        title: "Error",
        description: "Please enter a patient ID",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingPatientSamples(true);
    
    try {
      // First, check if patient exists and is currently admitted
      const { data: patientExists, error: patientError } = await supabase
        .from("patients")
        .select("id, patient_id, status, culture_required")
        .eq("patient_id", patientIdInput)
        .eq("status", "admitted") // Make sure patient is admitted
        .maybeSingle();
      
      if (patientError) throw patientError;
      
      if (!patientExists) {
        toast({
          title: "Patient not found or not admitted",
          description: `No admitted patient found with ID: ${patientIdInput}`,
          variant: "destructive",
        });
        setPatientLabSamples([]);
        setIsLoadingPatientSamples(false);
        return;
      }

      console.log("Found patient:", patientExists);
      
      // Check if there are pending lab samples
      const { data: existingSamples, error: existingSamplesError } = await supabase
        .from("lab_results")
        .select("id, sample_id, collection_date, patient_id, result")
        .eq("patient_id", patientExists.id)
        .is("result", null);
      
      if (existingSamplesError) throw existingSamplesError;

      console.log("Existing samples:", existingSamples);
      
      // If there are pending samples, show them
      if (existingSamples && existingSamples.length > 0) {
        setPatientLabSamples(existingSamples);
        toast({
          title: "Pending samples found",
          description: `Found ${existingSamples.length} pending lab samples for patient ${patientIdInput}`,
        });
      } else {
        // If no pending samples but culture is required, create a new sample
        if (patientExists.culture_required) {
          // Generate a sample ID for the lab test
          const sampleId = `MDRO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
          
          // Create a new lab sample
          const { data: newSample, error: newSampleError } = await supabase
            .from("lab_results")
            .insert([{
              patient_id: patientExists.id,
              sample_id: sampleId,
              collection_date: new Date().toISOString(),
            }])
            .select();
          
          if (newSampleError) throw newSampleError;
          
          console.log("Created new sample:", newSample);
          
          if (newSample && newSample.length > 0) {
            setPatientLabSamples(newSample);
            toast({
              title: "New sample created",
              description: `Created a new lab sample for patient ${patientIdInput}`,
            });
          }
        } else {
          toast({
            title: "No culture required",
            description: `Patient ${patientIdInput} does not require MDRO culture`,
            variant: "default",
          });
          setPatientLabSamples([]);
        }
      }
    } catch (error) {
      console.error("Error finding patient samples:", error);
      toast({
        title: "Error",
        description: "Failed to retrieve patient samples",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPatientSamples(false);
    }
  };

  const handleSelectSampleForResult = (sample: PatientLabSample, result: "positive" | "negative") => {
    setSelectedSample(sample);
    setSelectedResult(result);
    setShowResultConfirm(true);
  };

  const handleConfirmLabResult = async () => {
    if (!selectedSample || !selectedResult) return;
    
    setIsSubmitting(true);
    
    try {
      const { data, error } = await supabase
        .from("lab_results")
        .update({
          result: selectedResult,
          processed_by: "Administrator",
          processed_date: new Date().toISOString(),
        })
        .eq("id", selectedSample.id)
        .select();
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: `Lab result updated successfully for sample ${selectedSample.sample_id}`,
      });
      
      setPatientLabSamples(prevSamples => 
        prevSamples.filter(sample => sample.id !== selectedSample.id)
      );
      
      queryClient.invalidateQueries({ queryKey: ['lab_results'] });
      
    } catch (error) {
      console.error("Error updating lab result:", error);
      toast({
        title: "Error",
        description: "Failed to update lab result",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      setShowResultConfirm(false);
      setSelectedSample(null);
      setSelectedResult(null);
    }
  };

  const handleDischargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!dischargePatientId.trim()) {
      toast({
        title: "Error",
        description: "Please enter a patient ID to discharge",
        variant: "destructive",
      });
      return;
    }

    setShowDischargeConfirm(true);
  };

  const confirmDischarge = async () => {
    try {
      const { data, error } = await supabase
        .from("patients")
        .update({
          status: "discharged",
          discharge_date: new Date().toISOString()
        })
        .eq("patient_id", dischargePatientId)
        .select() as { data: Patient[] | null, error: any };
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        toast({
          title: "Success",
          description: `Patient ${dischargePatientId} discharged successfully`,
        });
        setDischargePatientId("");
        refetchPatients();
      } else {
        toast({
          title: "Error",
          description: "No patient found with the provided ID",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error discharging patient:", error);
      toast({
        title: "Error",
        description: "Failed to discharge patient",
        variant: "destructive",
      });
    } finally {
      setShowDischargeConfirm(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50/40">
      <DashboardHeader title="TraceMed" role="Administrator" />

      {/* Result Confirmation Dialog */}
      <AlertDialog open={showResultConfirm} onOpenChange={setShowResultConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Lab Result</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to submit the following result:
              <div className="mt-4 p-4 bg-gray-100 rounded-md">
                <p><strong>Sample ID:</strong> {selectedSample?.sample_id}</p>
                <p><strong>Collection Date:</strong> {selectedSample?.collection_date && format(new Date(selectedSample.collection_date), "MMM dd, yyyy")}</p>
                <p className="mt-2">
                  <strong>Result:</strong>{" "}
                  <Badge variant={selectedResult === "positive" ? "destructive" : "default"}>
                    {selectedResult === "positive" ? "MDRO Resistant" : "MDRO Susceptible"}
                  </Badge>
                </p>
              </div>
              <p className="mt-4">
                Are you sure you want to submit this result? This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmLabResult}
              disabled={isSubmitting}
              className={selectedResult === "positive" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Result"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discharge Confirmation Dialog */}
      <AlertDialog open={showDischargeConfirm} onOpenChange={setShowDischargeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Patient Discharge</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to discharge patient {dischargePatientId}? This will update their status to "discharged" and record the current date as their discharge date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDischarge}>Confirm Discharge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="w-full max-w-6xl mx-auto px-4 py-10">
        <div className="flex flex-col gap-2 mb-10 text-center">
          <h1 className="text-3xl font-light tracking-tight text-gray-800">Administrator Dashboard</h1>
          <p className="text-base text-gray-500">Monitor and manage patient data</p>
        </div>
        
        <Tabs defaultValue="criticalCases" className="w-full">
          <TabsList className="mb-8 bg-gray-100/80 rounded-xl shadow-sm">
            <TabsTrigger 
              value="criticalCases" 
              className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-gray-800 data-[state=active]:shadow-sm text-lg py-3 flex-1 flex items-center justify-center gap-2"
            >
              <AlertTriangle className="h-5 w-5" />
              Critical Cases
            </TabsTrigger>
            <TabsTrigger 
              value="inputLabResults" 
              className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-gray-800 data-[state=active]:shadow-sm text-lg py-3 flex-1 flex items-center justify-center gap-2"
            >
              <FileText className="h-5 w-5" />
              Input Lab Results
            </TabsTrigger>
            <TabsTrigger 
              value="allPatients" 
              className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-gray-800 data-[state=active]:shadow-sm text-lg py-3 flex-1 flex items-center justify-center gap-2"
            >
              <Users className="h-5 w-5" />
              All Patients
            </TabsTrigger>
            <TabsTrigger 
              value="dischargePatient" 
              className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-gray-800 data-[state=active]:shadow-sm text-lg py-3 flex-1 flex items-center justify-center gap-2"
            >
              <Users className="h-5 w-5" />
              Discharge Patient
            </TabsTrigger>
            <TabsTrigger
              value="notifications"
              className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-gray-800 data-[state=active]:shadow-sm text-lg py-3 flex-1 flex items-center justify-center gap-2"
            >
              <Bell className="h-5 w-5" />
              Notifications
            </TabsTrigger>
          </TabsList>

          <TabsContent value="criticalCases">
            <Card className="border-gray-100 shadow-sm mb-8">
              <CardHeader className="bg-gray-50/60 border-b border-gray-100">
                <CardTitle className="text-2xl font-normal text-gray-700">Critical Cases - Positive Results</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {isLoadingLabResults || isLoadingWardScanLogs ? (
                  <div className="flex justify-center py-10">
                    <div className="animate-pulse text-gray-500">Loading critical cases...</div>
                  </div>
                ) : enhancedCriticalCases.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sample ID</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient ID</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Collection Date</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Result</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Processed By</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Location</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Processed Date</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {enhancedCriticalCases.map((result) => (
                          <tr key={result.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{result.sample_id}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{result.patients?.patient_id}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {format(new Date(result.collection_date), 'MMM dd, yyyy')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge variant="destructive" className="px-3 py-1">Positive</Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{result.processed_by}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {result.lastLocation ? (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                  {result.lastLocation}
                                </Badge>
                              ) : (
                                <span className="text-gray-400 text-sm">Not scanned yet</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {result.processed_date && format(new Date(result.processed_date), 'MMM dd, yyyy HH:mm')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <p className="text-gray-500">No critical cases found.</p>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card className="border-gray-100 shadow-sm">
              <CardHeader className="bg-gray-50/60 border-b border-gray-100">
                <CardTitle className="text-2xl font-normal text-gray-700">Pending Cases - Awaiting Results</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {isLoadingLabResults || isLoadingWardScanLogs ? (
                  <div className="flex justify-center py-10">
                    <div className="animate-pulse text-gray-500">Loading pending cases...</div>
                  </div>
                ) : enhancedPendingCases.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sample ID</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient ID</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Collection Date</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Location</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time in System</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {enhancedPendingCases.map((result) => (
                          <tr key={result.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{result.sample_id}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{result.patients?.patient_id}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {format(new Date(result.collection_date), 'MMM dd, yyyy')}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge variant="secondary" className="px-3 py-1">Pending</Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {result.lastLocation ? (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                  {result.lastLocation}
                                </Badge>
                              ) : (
                                <span className="text-gray-400 text-sm">Not scanned yet</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {format(new Date(result.collection_date), 'MMM dd, yyyy')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <p className="text-gray-500">No pending cases found.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inputLabResults">
            <Card className="border-gray-100 shadow-sm mb-8">
              <CardHeader className="bg-gray-50/60 border-b border-gray-100">
                <CardTitle className="text-2xl font-normal text-gray-700">Input Lab Results</CardTitle>
                <CardDescription>Enter patient ID to view and update pending lab samples</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-8">
                  <div className="max-w-md">
                    <Label htmlFor="patientIdInput" className="text-lg font-medium mb-2 block">Patient ID</Label>
                    <div className="flex gap-3">
                      <Input
                        id="patientIdInput"
                        placeholder="Enter patient ID"
                        value={patientIdInput}
                        onChange={(e) => setPatientIdInput(e.target.value)}
                        className="text-lg py-6"
                      />
                      <Button 
                        onClick={handleFindPatientSamples} 
                        disabled={isLoadingPatientSamples}
                        className="py-6 px-6 text-lg"
                      >
                        {isLoadingPatientSamples ? (
                          <>
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            Searching...
                          </>
                        ) : (
                          <>
                            <Search className="h-5 w-5 mr-2" />
                            Search
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {patientLabSamples.length > 0 && (
                    <div className="mt-8">
                      <h3 className="text-xl font-medium text-gray-700 mb-4">Pending Lab Samples</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Sample ID</TableHead>
                            <TableHead>Collection Date</TableHead>
                            <TableHead>Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {patientLabSamples.map(sample => (
                            <TableRow key={sample.id}>
                              <TableCell>{sample.sample_id}</TableCell>
                              <TableCell>{format(new Date(sample.collection_date), 'MMM dd, yyyy')}</TableCell>
                              <TableCell className="space-x-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-green-500 hover:bg-green-50 text-green-700"
                                  onClick={() => handleSelectSampleForResult(sample, "negative")}
                                >
                                  Susceptible
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-red-500 hover:bg-red-50 text-red-700"
                                  onClick={() => handleSelectSampleForResult(sample, "positive")}
                                >
                                  Resistant
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="allPatients">
            <div className="flex flex-col space-y-6">
              <Input
                placeholder="Search patient ID"
                value={patientIdFilter}
                onChange={e => setPatientIdFilter(e.target.value)}
                className="max-w-md"
              />
              <div className="overflow-x-auto rounded-md border border-gray-300">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Patient ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MDRO Culture</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Registration Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Discharge Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPatients.map(patient => (
                      <tr key={patient.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">{patient.patient_id}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{patient.status}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{patient.culture_required ? "Required" : "Not Required"}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{format(new Date(patient.registration_date), 'MMM dd, yyyy')}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{patient.discharge_date ? format(new Date(patient.discharge_date), 'MMM dd, yyyy') : '-'}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          <Button
                            size="sm"
                            onClick={() => handleViewPatientLogs(patient.patient_id)}
                          >
                            View Logs
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="dischargePatient">
            <form onSubmit={handleDischargeSubmit} className="max-w-sm space-y-4">
              <Label htmlFor="dischargePatientId" className="block text-sm font-medium text-gray-700">
                Patient ID to Discharge
              </Label>
              <Input
                id="dischargePatientId"
                type="text"
                value={dischargePatientId}
                onChange={e => setDischargePatientId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm sm:text-sm"
              />
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Discharging...' : 'Discharge Patient'}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="notifications">
            <div className="flex flex-col gap-8">
              <AdminNotifications />
              <LocationInconsistencyAlerts />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Patient History Sheet Component */}
      <PatientHistory
        open={isPatientHistoryOpen}
        onOpenChange={setIsPatientHistoryOpen}
        patientId={selectedPatientForHistory}
      />
    </div>
  );
};

export default AdminDashboard;

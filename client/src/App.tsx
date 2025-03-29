import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { queryClient } from "./lib/queryClient";
import VideoConference from "./components/VideoConference";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900">
        <VideoConference />
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}

export default App;

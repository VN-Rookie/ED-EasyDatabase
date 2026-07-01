import { ToastProvider } from "./components/Toast";
import { AppShell } from "./app/AppShell";
import "./App.css";

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

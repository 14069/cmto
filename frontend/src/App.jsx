import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Classes from './pages/Classes.jsx';
import Students from './pages/Students.jsx';
import StudentProfile from './pages/StudentProfile.jsx';
import Discipline from './pages/Discipline.jsx';
import Praises from './pages/Praises.jsx';
import TAC from './pages/TAC.jsx';
import Calendar from './pages/Calendar.jsx';
import Reports from './pages/Reports.jsx';
import Users from './pages/Users.jsx';
import Audit from './pages/Audit.jsx';
import Settings from './pages/Settings.jsx';
import Profile from './pages/Profile.jsx';
import Honors from './pages/Honors.jsx';
import DailyControl from './pages/DailyControl.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="classes" element={<Classes />} />
        <Route path="students" element={<Students />} />
        <Route path="students/:id" element={<StudentProfile />} />
        <Route path="discipline" element={<Discipline />} />
        <Route path="praises" element={<Praises />} />
        <Route path="tac" element={<TAC />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="reports" element={<Reports />} />
        <Route path="daily-control" element={<DailyControl />} />
        <Route path="honors" element={<Honors />} />
        <Route path="users" element={<Users />} />
        <Route path="audit" element={<Audit />} />
        <Route path="settings" element={<Settings />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import React from 'react';
import { SetupWizard as SetupWizardComponent } from '../components/SetupWizard';

interface SetupWizardPageProps {
  onNavigateTab: (tab: string) => void;
  onOpenTerminalForTask?: (taskId: string, title?: string) => void;
}

export const SetupWizard: React.FC<SetupWizardPageProps> = ({
  onNavigateTab,
  onOpenTerminalForTask,
}) => {
  return (
    <SetupWizardComponent
      onNavigateTab={onNavigateTab}
      onOpenTerminalForTask={onOpenTerminalForTask}
    />
  );
};

export default SetupWizard;

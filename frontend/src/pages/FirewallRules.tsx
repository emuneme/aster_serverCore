import React from 'react';
import { FirewallManager } from '../components/FirewallManager';

interface FirewallRulesProps {
  onOpenTerminalForTask: (taskId: string, title?: string) => void;
}

export const FirewallRules: React.FC<FirewallRulesProps> = ({ onOpenTerminalForTask }) => {
  return <FirewallManager onOpenTerminalForTask={onOpenTerminalForTask} />;
};

export { FirewallManager };
export default FirewallRules;

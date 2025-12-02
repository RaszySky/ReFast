import { PluginListWindow } from "./components/PluginListWindow";
import "./styles.css";

function PluginListApp() {
  return (
    <div 
      className="h-screen w-screen" 
      style={{ 
        backgroundColor: '#f9fafb', 
        margin: 0, 
        padding: 0,
        overflow: 'hidden'
      }}
    >
      <PluginListWindow />
    </div>
  );
}

export default PluginListApp;




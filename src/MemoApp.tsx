import { MemoWindow } from "./components/MemoWindow";
import "./styles.css";

function MemoApp() {
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
      <MemoWindow />
    </div>
  );
}

export default MemoApp;




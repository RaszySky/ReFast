import { TranslationWindow } from "./components/TranslationWindow";
import "./styles.css";

function TranslationApp() {
  return (
    <div
      className="h-screen w-screen"
      style={{
        backgroundColor: "#f9fafb",
        margin: 0,
        padding: 0,
        height: "100vh",
        width: "100vw",
      }}
    >
      <TranslationWindow />
    </div>
  );
}

export default TranslationApp;


import ReactDOM from "react-dom";
import App from "./App";
import * as serviceWorker from "./serviceWorker";
import "bootstrap/dist/css/bootstrap.min.css";
import "./index.css";
import { initHtmlElements } from "./tools/utils";

ReactDOM.render(<App />, document.getElementById("root"));
initHtmlElements();

serviceWorker.register();

import "leaflet/dist/leaflet.css";
import "./styles/widget.css";
import { mountTNWWWidget } from "./mount";

const target = document.getElementById("tnww");
if (target) {
  mountTNWWWidget(target, "http://localhost:8000");
}

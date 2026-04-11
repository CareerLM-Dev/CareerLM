# generate_graph.py
# Run from your backend root: python generate_graph.py

import asyncio
from app.agents.orchestrator.graph import orchestrator_graph

def main():
    # Get the underlying graph
    graph = orchestrator_graph
    
    # Method 1 — Save as PNG directly
    try:
        png_bytes = graph.get_graph().draw_mermaid_png()
        with open("orchestrator_graph.png", "wb") as f:
            f.write(png_bytes)
        print("Saved orchestrator_graph.png")
    except Exception as e:
        print(f"PNG failed: {e}")
    
    # Method 2 — Save as Mermaid text (can paste into mermaid.live)
    try:
        mermaid_code = graph.get_graph().draw_mermaid()
        with open("orchestrator_graph.mmd", "w") as f:
            f.write(mermaid_code)
        print("Saved orchestrator_graph.mmd")
        print("\nMermaid code:")
        print(mermaid_code)
    except Exception as e:
        print(f"Mermaid failed: {e}")

if __name__ == "__main__":
    main()
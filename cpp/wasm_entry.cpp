#include <string>
#include <sstream>
#include "Graph.h"

#include <emscripten/bind.h>
using namespace emscripten;

// Input format (with edge IDs):
// V E
// <V vertex tokens>
// <E lines: edgeId src dst weight>
static Graph parseGraphFromText(const std::string& input) {
    std::istringstream in(input);

    int V, E;
    in >> V >> E;

    Graph g(V, E);

    for (int i = 0; i < V; i++) {
        std::string name;
        in >> name;
        g.addVertex(name, i);
    }

    for (int i = 0; i < E; i++) {
        std::string edgeId, s, d;
        int w;
        in >> edgeId >> s >> d >> w;
        g.addEdge(edgeId, w, s, d);
    }

    return g;
}

std::string runKruskalStepsJSON(const std::string& inputText) {
    Graph g = parseGraphFromText(inputText);
    return g.mst_steps_json();
}

EMSCRIPTEN_BINDINGS(graph_analysis_tool) {
    ::emscripten::function("runKruskalStepsJSON", &runKruskalStepsJSON);
}

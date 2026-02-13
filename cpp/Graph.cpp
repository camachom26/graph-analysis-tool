#include "Graph.h"
#include <sstream>

vector<edge> Graph::mergeEdges(vector<edge>& v1, vector<edge>& v2) {
    vector<edge> sortedList;
    int i = 0, j = 0;
    int m = (int)v1.size();
    int n = (int)v2.size();

    while (i < m && j < n) {
        if (v1.at(i).weight < v2.at(j).weight) {
            sortedList.push_back(v1.at(i));
            i++;
        } else {
            sortedList.push_back(v2.at(j));
            j++;
        }
    }
    while (i < m) { sortedList.push_back(v1.at(i++)); }
    while (j < n) { sortedList.push_back(v2.at(j++)); }

    return sortedList;
}

vector<edge> Graph::sortEdges(vector<edge>& v, int low, int hi) {
    if (low == hi) {
        vector<edge> sorted;
        sorted.push_back(v.at(low));
        return sorted;
    }
    int mid = (low + hi) / 2;
    vector<edge> lower = sortEdges(v, low, mid);
    vector<edge> upper = sortEdges(v, mid + 1, hi);

    // Note: order doesn't matter as long as merge assumes both sorted
    vector<edge> merged = mergeEdges(lower, upper);
    return merged;
}

void Graph::sort() {
    if (edges.empty()) return;
    edges = sortEdges(edges, 0, (int)edges.size() - 1);
}

void Graph::make_set() {
    parent.resize(numVertices);
    rnk.resize(numVertices);
    for (const auto& kv : vertices) {
        int vertex = kv.second;
        parent[vertex] = vertex;
        rnk[vertex] = 0;
    }
}

int Graph::find_set(int a) {
    if (parent[a] == a) return a;
    return parent[a] = find_set(parent[a]);
}

bool Graph::union_set(int a, int b) {
    a = find_set(a);
    b = find_set(b);
    if (a == b) return false;

    if (rnk[a] < rnk[b]) {
        int tmp = a; a = b; b = tmp;
    }
    parent[b] = a;
    if (rnk[a] == rnk[b]) rnk[a]++;
    return true;
}

Graph::Graph(int v, int e) {
    numVertices = v;
    numEdges = e;
}

void Graph::addVertex(const string& vertexName, int vertexIndex) {
    vertices.emplace(vertexName, vertexIndex);
}

int Graph::getIndex(const string& vertexName) const {
    auto it = vertices.find(vertexName);
    if (it == vertices.end()) return -1;
    return it->second;
}

void Graph::addEdge(const string& edgeId, int weight, const string& src, const string& dst) {
    edges.emplace_back(edgeId, weight, src, dst);
}

vector<edge> Graph::mst(int & cost) {
    vector<edge> minimumSpanningTree;
    cost = 0;
    sort();
    make_set();

    for (const edge& e : edges) {
        int a = getIndex(e.src);
        int b = getIndex(e.dst);
        if (a >= 0 && b >= 0 && union_set(a, b)) {
            minimumSpanningTree.push_back(e);
            cost += e.weight;
        }
    }
    return minimumSpanningTree;
}

string Graph::json_escape(const string& s) {
    std::ostringstream o;
    for (char c : s) {
        switch (c) {
            case '\"': o << "\\\""; break;
            case '\\': o << "\\\\"; break;
            case '\n': o << "\\n"; break;
            case '\r': o << "\\r"; break;
            case '\t': o << "\\t"; break;
            default: o << c; break;
        }
    }
    return o.str();
}

// Returns:
// {
//   "steps":[
//     {
//       "consideredEdgeId":"e1",
//       "action":"accept"|"reject",
//       "reason":"ok"|"cycle",
//       "totalWeight":<number>,
//       "mstEdgeIds":[...],
//       "rejectedEdgeIds":[...]
//     }, ...
//   ],
//   "mstWeight":<number>
// }
string Graph::mst_steps_json() {
    sort();
    make_set();

    vector<string> mstEdgeIds;
    vector<string> rejectedEdgeIds;
    int total = 0;

    std::ostringstream out;
    out << "{";
    out << "\"steps\":[";

    bool first = true;

    for (const edge& e : edges) {
        int a = getIndex(e.src);
        int b = getIndex(e.dst);

        bool accepted = false;
        if (a >= 0 && b >= 0) {
            accepted = union_set(a, b);
        }

        if (accepted) {
            mstEdgeIds.push_back(e.id);
            total += e.weight;
        } else {
            rejectedEdgeIds.push_back(e.id);
        }

        if (!first) out << ",";
        first = false;

        out << "{";
        out << "\"consideredEdgeId\":\"" << json_escape(e.id) << "\",";
        out << "\"action\":\"" << (accepted ? "accept" : "reject") << "\",";
        out << "\"reason\":\"" << (accepted ? "ok" : "cycle") << "\",";
        out << "\"totalWeight\":" << total << ",";

        out << "\"mstEdgeIds\":[";
        for (size_t i = 0; i < mstEdgeIds.size(); i++) {
            if (i) out << ",";
            out << "\"" << json_escape(mstEdgeIds[i]) << "\"";
        }
        out << "],";

        out << "\"rejectedEdgeIds\":[";
        for (size_t i = 0; i < rejectedEdgeIds.size(); i++) {
            if (i) out << ",";
            out << "\"" << json_escape(rejectedEdgeIds[i]) << "\"";
        }
        out << "]";

        out << "}";
    }

    out << "],";
    out << "\"mstWeight\":" << total;
    out << "}";

    return out.str();
}

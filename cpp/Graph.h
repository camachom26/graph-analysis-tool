#pragma once
#include <vector>
#include <string>
#include <map>

using namespace std;

struct edge {
    string id;
    int weight;
    string src;
    string dst;

    edge(const string& edgeId, int w, const string& A, const string& B)
        : id(edgeId), weight(w), src(A), dst(B) {}
};

class Graph {
private:
    int numVertices, numEdges;
    vector<int> parent;
    vector<int> rnk;
    map<string, int> vertices;
    vector<edge> edges;

    vector<edge> mergeEdges(vector<edge>& v1, vector<edge>& v2);
    vector<edge> sortEdges(vector<edge>& v, int low, int hi);
    void sort();

    void make_set();
    int find_set(int a);
    bool union_set(int a, int b);

    static string json_escape(const string& s);

public:
    explicit Graph(int v, int e);
    void addVertex(const string& vertexName, int vertexIndex);
    int getIndex(const string& vertexName) const;

    void addEdge(const string& edgeId, int weight, const string& src, const string& dst);

    // Classic MST result (kept for completeness)
    vector<edge> mst(int & cost);

    // Step-by-step JSON for UI animation
    string mst_steps_json();
};

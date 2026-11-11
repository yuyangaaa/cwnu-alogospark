#include <bits/stdc++.h>
using namespace std;
int main() {
    int n, m;
    cin >> n >> m;
    vector<vector<long long>> a(n, vector<long long>(m));
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < m; j++) cin >> a[i][j];
    }
    for (int i = 0; i < n; i++) {
        long long sum = 0;
        for (int j = 0; j < m; j++) sum += a[i][j];
        if (i) cout << ' ';
        cout << sum;
    }
    cout << '\n';
}

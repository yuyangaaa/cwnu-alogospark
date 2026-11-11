#include <bits/stdc++.h>
using namespace std;
long long maximum(long long a, long long b) {
    if (a > b) return a;
    return b;
}
int main() {
    int n;
    cin >> n;
    long long answer = 0;
    for (int i = 0; i < n; i++) {
        long long a, b;
        cin >> a >> b;
        answer += maximum(a, b);
    }
    cout << answer << '\n';
}

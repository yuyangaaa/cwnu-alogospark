#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    long long sum = 0, x;
    for (int i = 0; i < n; i++) {
        cin >> x;
        sum += x;
    }
    cout << fixed << setprecision(2) << 1.0 * sum / n << '\n';
}

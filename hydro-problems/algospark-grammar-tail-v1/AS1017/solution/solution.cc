#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<int> a(n);
    for (int &x : a) cin >> x;
    int highest = a[0], lowest = a[0], countHighest = 0;
    for (int x : a) {
        highest = max(highest, x);
        lowest = min(lowest, x);
    }
    for (int x : a) if (x == highest) countHighest++;
    cout << highest << ' ' << lowest << ' ' << countHighest << '\n';
}

#include <bits/stdc++.h>
using namespace std;
int main() {
    string s;
    char target;
    cin >> s >> target;
    int answer = 0;
    for (char c : s) if (c == target) answer++;
    cout << answer << '\n';
}

import 'package:flutter_test/flutter_test.dart';
import 'package:smart_access/main.dart';

void main() {
  testWidgets('shows the access-only nearby doors screen', (tester) async {
    await tester.pumpWidget(const SmartAccessApp());

    expect(find.text('Smart Access'), findsOneWidget);
    expect(find.text('Nearby doors'), findsOneWidget);
    expect(
      find.text('Tap a door to unlock with your fingerprint or face.'),
      findsOneWidget,
    );
  });
}
